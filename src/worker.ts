import { Worker, QueueEvents, Queue, Job, UnrecoverableError } from 'bullmq';
import { redisKeys } from './redis/keys';
import { redisChannels } from './redis/channels';
import { env } from './config/env';
import { createRedisClient } from './redis/client';
import { ModelProviderService } from './ai/ModelProviderService';
import { getSecondsUntilMidnightPT, getCurrentDatePT } from './utils/time';
import type { Mode } from '../types/mode';

type ModeType = 'hard' | 'lite';

interface JobPayload {
  jobId: string;
  userId: string;
  requestedModel: string;
  model: string;
  payload: {
    cvDescription: string;
    jobDescription?: string;
    mode: Mode;
    locale: string;
  };
  role: 'user' | 'admin';
  modeType: ModeType;
}

enum ConsumeCode {
  OK = 1,
  ModelRpmExceeded = -1,
  ModelRpdExceeded = -2,
  UserRpdExceeded = -3,
}

const redis = createRedisClient();
const subRedis = createRedisClient();
const modelProvider = new ModelProviderService();

const MINUTE_TTL = 70;
const DEFAULT_CONCURRENCY = { hard: 3, lite: 8 };
const activeConcurrency = { ...DEFAULT_CONCURRENCY };

const queues = {
  lite: new Queue(env.queueLiteName, { connection: { url: env.redisUrl } }),
  hard: new Queue(env.queueHardName, { connection: { url: env.redisUrl } }),
};

const queueEvents = {
  lite: new QueueEvents(env.queueLiteName, { connection: { url: env.redisUrl } }),
  hard: new QueueEvents(env.queueHardName, { connection: { url: env.redisUrl } }),
};

const removeLock = async (userId: string, jobId: string) => {
  await redis.zrem(redisKeys.userActiveJobs(userId), jobId);
};

const releaseWaitingCounter = async (model: string) => {
  const key = redisKeys.queueWaitingModel(model);
  const current = await redis.decr(key);
  if (current && current < 0) {
    await redis.set(key, 0);
  }
};

const returnTokens = async (model: string) => {
  const dayTtl = getSecondsUntilMidnightPT();
  const pipeline = redis.pipeline();

  pipeline.decrby(redisKeys.modelRpm(model), 1);
  pipeline.expire(redisKeys.modelRpm(model), MINUTE_TTL);

  pipeline.decrby(redisKeys.modelRpd(model), 1);
  pipeline.expire(redisKeys.modelRpd(model), dayTtl);

  await pipeline.exec();
};

const consumeModelLimits = async (
  model: string,
  userId: string,
  modeType: ModeType,
  limits: { modelRpm: number; modelRpd: number; userRpd: number }
): Promise<number> => {
  const dayTtl = getSecondsUntilMidnightPT();
  const userDayTtl = dayTtl;
  return redis.consumeExecutionLimits(
    [
      redisKeys.modelRpm(model),
      redisKeys.modelRpd(model),
      redisKeys.userTypeRpd(userId, modeType, getCurrentDatePT()),
    ],
    [limits.modelRpm, limits.modelRpd, limits.userRpd, MINUTE_TTL, dayTtl, userDayTtl, 1]
  );
};

const handleJob = async (queueType: ModeType, job: Job<JobPayload>) => {
  const { userId, model, payload } = job.data;
  const jobId = job.id as string;
  const now = new Date().toISOString();

  await redis.hset(redisKeys.jobMeta(jobId), {
    status: 'in_progress',
    updated_at: now,
  });

  const modelLimits = await redis.hgetall(redisKeys.modelLimits(model));
  const modelRpmLimit = Number(modelLimits?.rpm ?? 0);
  const modelRpdLimit = Number(modelLimits?.rpd ?? 0);

  const consumeCode = await consumeModelLimits(model, userId, queueType, {
    modelRpm: modelRpmLimit,
    modelRpd: modelRpdLimit,
    userRpd: 0, // user RPD спожито в API
  });

  if (consumeCode === ConsumeCode.ModelRpmExceeded) {
    const ttl = await redis.ttl(redisKeys.modelRpm(model));
    const delayMs = Math.max(ttl, 1) * 1000;
    await redis.hset(redisKeys.jobMeta(jobId), { status: 'queued' });
    await job.moveToDelayed(Date.now() + delayMs, job.token);
    return;
  }

  if (consumeCode === ConsumeCode.ModelRpdExceeded || consumeCode === ConsumeCode.UserRpdExceeded) {
    const reason =
      consumeCode === ConsumeCode.ModelRpdExceeded ? 'MODEL_RPD_EXCEEDED' : 'USER_RPD_EXCEEDED';
    // не ретраїмо такі фейли
    throw new UnrecoverableError(reason);
  }

  await redis.hset(redisKeys.jobMeta(jobId), { tokens_consumed: 'true' });

  try {
    const result = await modelProvider.execute({
      model,
      cvDescription: payload.cvDescription,
      jobDescription: payload.jobDescription,
      mode: payload.mode,
      locale: payload.locale,
    });

    await releaseWaitingCounter(model);

    const finishedAt = new Date().toISOString();
    const pipe = redis.pipeline();
    pipe.hset(redisKeys.jobMeta(jobId), {
      processed_model: result.usedModel,
      status: 'completed',
    });
    pipe.hset(redisKeys.jobResult(jobId), {
      status: 'completed',
      data: result.text,
      finished_at: finishedAt,
      used_model: result.usedModel,
    });
    pipe.zrem(redisKeys.userActiveJobs(userId), jobId);
    await pipe.exec();
  } catch (err: any) {
    if (err?.retryable === false) {
      throw new UnrecoverableError(err?.message || 'provider_fatal_error');
    }
    throw err;
  }
};

const createWorker = (queueName: string, queueType: ModeType, concurrency: number) =>
  new Worker(
    queueName,
    async (job) => {
      await handleJob(queueType, job);
    },
    {
      connection: { url: env.redisUrl },
      concurrency,
    }
  );

const workers = {
  lite: createWorker(env.queueLiteName, 'lite', DEFAULT_CONCURRENCY.lite),
  hard: createWorker(env.queueHardName, 'hard', DEFAULT_CONCURRENCY.hard),
};

const parseConcurrency = (raw: string | null, fallback: number) => {
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const fetchConcurrencyConfig = async () => {
  const [liteRaw, hardRaw] = await Promise.all([
    redis.get(redisKeys.workerConcurrency('lite')),
    redis.get(redisKeys.workerConcurrency('hard')),
  ]);

  return {
    lite: parseConcurrency(liteRaw, DEFAULT_CONCURRENCY.lite),
    hard: parseConcurrency(hardRaw, DEFAULT_CONCURRENCY.hard),
  };
};

const reloadWorker = async (queueType: ModeType, concurrency: number) => {
  const old = workers[queueType];
  await old.close();
  const queueName = queueType === 'hard' ? env.queueHardName : env.queueLiteName;
  workers[queueType] = createWorker(queueName, queueType, concurrency);
};

const refreshConcurrencyLoop = async () => {
  try {
    const desired = await fetchConcurrencyConfig();
    const updates: Array<Promise<void>> = [];

    if (desired.lite !== activeConcurrency.lite) {
      activeConcurrency.lite = desired.lite;
      updates.push(reloadWorker('lite', desired.lite));
    }
    if (desired.hard !== activeConcurrency.hard) {
      activeConcurrency.hard = desired.hard;
      updates.push(reloadWorker('hard', desired.hard));
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (err) {
    console.error('Failed to refresh worker concurrency', err);
  }
};

const setupConfigSubscription = async () => {
  try {
    await subRedis.subscribe(redisChannels.configUpdate, async () => {
      await refreshConcurrencyLoop();
    });
  } catch (err) {
    console.error('Failed to subscribe to config updates', err);
  }
};

const registerQueueEvents = (queueEvent: QueueEvents, queueType: ModeType) => {
  queueEvent.on('failed', async ({ jobId, failedReason }) => {
    const queue = queues[queueType];
    const job = await queue.getJob(jobId as string);
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts.attempts ?? 1;
    const isFinalAttempt = job ? attemptsMade >= maxAttempts : true;

    if (!isFinalAttempt) {
      return;
    }

    const meta = await redis.hgetall(redisKeys.jobMeta(jobId as string));

    const userId = meta.user_id;
    const model = meta.processed_model || meta.requested_model;
    if (userId && model && meta.tokens_consumed === 'true') {
      await returnTokens(model);
    }

    if (userId) {
      await removeLock(userId, jobId as string);
    }

    await releaseWaitingCounter(model);

    const reason = failedReason || 'provider_error';
    let errorCode = 'provider_error';
    if (reason === 'MODEL_RPD_EXCEEDED') errorCode = 'limit';
    if (reason === 'USER_RPD_EXCEEDED') errorCode = 'expired';

    await redis.hset(redisKeys.jobResult(jobId as string), {
      status: 'failed',
      error: reason,
      error_code: errorCode,
      finished_at: new Date().toISOString(),
    });
  });
};

registerQueueEvents(queueEvents.lite, 'lite');
registerQueueEvents(queueEvents.hard, 'hard');

void refreshConcurrencyLoop();
void setupConfigSubscription();

const shutdown = async () => {
  await Promise.all([workers.lite.close(), workers.hard.close()]);
  await Promise.all([queueEvents.lite.close(), queueEvents.hard.close()]);
  await Promise.all([queues.lite.close(), queues.hard.close()]);
  await Promise.all([redis.quit(), subRedis.quit()]);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
