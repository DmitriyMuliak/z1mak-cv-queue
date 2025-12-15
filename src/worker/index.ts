import { Worker, QueueEvents, Queue } from 'bullmq';
import { createRedisClient } from '../redis/client';
import { redisChannels } from '../redis/channels';
import { env } from '../config/env';
import { ModelProviderService } from '../ai/ModelProviderService';
import { createConcurrencyManager, ModeType, WorkerMap } from './concurrencyManager';
import { createQueueEventsRegistrar } from './queueEvents';
import { createReturnTokens } from './returnTokens';
import { createConsumeModelLimits } from './consumeModelLimits';
import { createMarkInProgress } from './markInProgress';
import { createConsumeLimitsIfNeeded } from './consumeLimitsIfNeeded';
import { createExecuteModel } from './executeModel';
import { createFinalizeSuccess } from './finalizeSuccess';
import { finalizeFailure } from './finalizeFailure';
import { createHandleJob } from './handleJob';

const MINUTE_TTL = 70;

const redis = createRedisClient();
const subRedis = createRedisClient();
const modelProvider = new ModelProviderService();

const queues = {
  lite: new Queue(env.queueLiteName, { connection: { url: env.redisUrl } }),
  hard: new Queue(env.queueHardName, { connection: { url: env.redisUrl } }),
};

const queueEvents = {
  lite: new QueueEvents(env.queueLiteName, { connection: { url: env.redisUrl } }),
  hard: new QueueEvents(env.queueHardName, { connection: { url: env.redisUrl } }),
};

const returnTokens = createReturnTokens(redis, MINUTE_TTL);
const consumeModelLimits = createConsumeModelLimits(redis, MINUTE_TTL);
const markInProgress = createMarkInProgress(redis);
const consumeLimitsIfNeeded = createConsumeLimitsIfNeeded({ redis, consumeModelLimits });
const executeModel = createExecuteModel(modelProvider);
const finalizeSuccess = createFinalizeSuccess(redis);
const handleJob = createHandleJob({
  redis,
  markInProgress,
  consumeLimitsIfNeeded,
  executeModel,
  finalizeSuccess,
  finalizeFailure,
});

const queueNames: Record<ModeType, string> = {
  lite: env.queueLiteName,
  hard: env.queueHardName,
};

const createWorker = (queueType: ModeType, concurrency: number) =>
  new Worker(
    queueNames[queueType],
    async (job) => {
      await handleJob(queueType, job);
    },
    {
      connection: { url: env.redisUrl },
      concurrency,
    }
  );

let workers: WorkerMap;
const concurrencyManager = createConcurrencyManager({
  redis,
  createWorker,
  workersRef: () => workers,
});

const setupConfigSubscription = async () => {
  try {
    await subRedis.subscribe(redisChannels.configUpdate, async () => {
      await concurrencyManager.refreshConcurrency();
    });
  } catch (err) {
    console.error('Failed to subscribe to config updates', err);
  }
};

const registerQueueEvents = createQueueEventsRegistrar({
  redis,
  queues,
  returnTokens,
});

const start = async () => {
  workers = await concurrencyManager.initWorkers();
  registerQueueEvents(queueEvents.lite, 'lite');
  registerQueueEvents(queueEvents.hard, 'hard');
  await concurrencyManager.refreshConcurrency();
  await setupConfigSubscription();
};

void start();

const shutdown = async () => {
  await Promise.all([workers.lite.close(), workers.hard.close()]);
  await Promise.all([queueEvents.lite.close(), queueEvents.hard.close()]);
  await Promise.all([queues.lite.close(), queues.hard.close()]);
  await Promise.all([redis.quit(), subRedis.quit()]);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
