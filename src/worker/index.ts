import { QueueEvents, Queue } from 'bullmq';
import { env } from '../config/env';
import { createRedisClient, RedisWithScripts } from '../redis/client';
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
import { createWorkerFactory } from './createWorker';
import { createConfigSubscription } from './configSubscription';
import { waitForModelLimits } from './preflight';

const redis = createRedisClient();
const subRedis = redis.duplicate() as RedisWithScripts;
const modelProvider = new ModelProviderService();

const MINUTE_TTL = 70;

const queueNames: Record<ModeType, string> = {
  lite: env.queueLiteName,
  hard: env.queueHardName,
};

const queues = {
  lite: new Queue(env.queueLiteName, { connection: { url: env.redisUrl } }),
  hard: new Queue(env.queueHardName, { connection: { url: env.redisUrl } }),
};

const queueEvents = {
  lite: new QueueEvents(env.queueLiteName, { connection: { url: env.redisUrl } }),
  hard: new QueueEvents(env.queueHardName, { connection: { url: env.redisUrl } }),
};

let workers: WorkerMap;

const returnTokens = createReturnTokens(redis, MINUTE_TTL);
const consumeModelLimits = createConsumeModelLimits(redis, MINUTE_TTL);
const markInProgress = createMarkInProgress(redis);
const consumeLimitsIfNeeded = createConsumeLimitsIfNeeded({ redis, consumeModelLimits });
const executeModel = createExecuteModel(modelProvider, redis);
const finalizeSuccess = createFinalizeSuccess(redis);
const handleJob = createHandleJob({
  redis,
  markInProgress,
  consumeLimitsIfNeeded,
  executeModel,
  finalizeSuccess,
  finalizeFailure,
});
const createWorker = createWorkerFactory({
  queueNames,
  redisUrl: env.redisUrl,
  handleJob,
});
const concurrencyManager = createConcurrencyManager({
  redis,
  createWorker,
  workersRef: () => workers,
});
const setupConfigSubscription = createConfigSubscription({
  subRedis,
  refreshConcurrency: concurrencyManager.refreshConcurrency,
});
const registerQueueEvents = createQueueEventsRegistrar({
  redis,
  queues,
  returnTokens,
});

const start = async () => {
  // Register events before workers to avoid missing fast-fail jobs.
  registerQueueEvents(queueEvents.lite, 'lite');
  registerQueueEvents(queueEvents.hard, 'hard');
  // Wait for model limits to be loaded before starting workers
  await waitForModelLimits(redis);
  workers = await concurrencyManager.initWorkers();
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
