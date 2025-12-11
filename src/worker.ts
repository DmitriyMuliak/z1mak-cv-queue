import { Worker, QueueEvents, Queue, Job } from 'bullmq';
import { redisKeys } from './redis/keys';
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
const modelProvider = new ModelProviderService();

const MINUTE_TTL = 70;

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
  const prefix = `[worker:${queueType}] job:${jobId} model:${model} user:${userId}`;

  

  await redis.hset(redisKeys.jobMeta(jobId), {
    status: 'in_progress',
    updated_at: now,
  });

  try {
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
      await job.moveToDelayed(Date.now() + delayMs);
      
      return;
    }

    if (consumeCode === ConsumeCode.ModelRpdExceeded || consumeCode === ConsumeCode.UserRpdExceeded) {
      const reason =
        consumeCode === ConsumeCode.ModelRpdExceeded ? 'MODEL_RPD_EXCEEDED' : 'USER_RPD_EXCEEDED';
      await redis.hset(redisKeys.jobResult(jobId), {
        status: 'failed',
        error: reason,
        error_code: consumeCode === ConsumeCode.ModelRpdExceeded ? 'limit' : 'expired',
        finished_at: new Date().toISOString(),
      });
      await removeLock(userId, jobId);
      await releaseWaitingCounter(model);
      
      return;
    }

    await redis.hset(redisKeys.jobMeta(jobId), { tokens_consumed: 'true' });

    const result = await modelProvider.execute({
      model,
      cvDescription: payload.cvDescription,
      jobDescription: payload.jobDescription,
      mode: payload.mode,
      locale: payload.locale,
    });

    await redis.hset(redisKeys.jobMeta(jobId), {
      processed_model: result.usedModel,
    });

    await redis.hset(redisKeys.jobResult(jobId), {
      status: 'completed',
      data: result.text,
      finished_at: new Date().toISOString(),
      used_model: result.usedModel,
    });

    await removeLock(userId, jobId);
    await releaseWaitingCounter(model);

  } catch (err: any & { retryable?: boolean }) {
    
    // Якщо помилка не ретраїбл або 5xx (не ретраїмо за домовленістю) — фіксуємо як failed
    if (!err?.retryable) {
      await redis.hset(redisKeys.jobResult(jobId), {
        status: 'failed',
        error: err?.message || 'Unknown error',
        error_code: 'provider_error',
        finished_at: new Date().toISOString(),
      });
      await removeLock(userId, jobId);
      await releaseWaitingCounter(model);
      return;
    }

    // retryable — нехай BullMQ робить retry
    throw err;
  }
};

const createWorker = (queueName: string, queueType: ModeType) =>
  new Worker(
    queueName,
    async (job) => {
      await handleJob(queueType, job);
    },
    {
      connection: { url: env.redisUrl },
      concurrency: queueType === 'hard' ? 3 : 8,
    }
  );

const workers = {
  lite: createWorker(env.queueLiteName, 'lite'),
  hard: createWorker(env.queueHardName, 'hard'),
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

    await redis.hset(redisKeys.jobResult(jobId as string), {
      status: 'failed',
      error: failedReason,
      error_code: 'provider_error',
      finished_at: new Date().toISOString(),
    });
  });
};

registerQueueEvents(queueEvents.lite, 'lite');
registerQueueEvents(queueEvents.hard, 'hard');

const shutdown = async () => {
  await Promise.all([workers.lite.close(), workers.hard.close()]);
  await Promise.all([queueEvents.lite.close(), queueEvents.hard.close()]);
  await Promise.all([queues.lite.close(), queues.hard.close()]);
  await redis.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
