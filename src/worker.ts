import { Worker, QueueEvents, Queue } from 'bullmq';
import { redisKeys } from './redis/keys';
import { env } from './config/env';
import { createRedisClient } from './redis/client';
import { ModelProviderService } from './ai/ModelProviderService';
import { getSecondsUntilMidnightPT, getCurrentDatePT } from './utils/time';

const redis = createRedisClient();
const modelProvider = new ModelProviderService();
const queue = new Queue(env.queueName, { connection: { url: env.redisUrl } });

const MINUTE_TTL = 70;

const removeLock = async (userId: string, jobId: string) => {
  await redis.zrem(redisKeys.userActiveJobs(userId), jobId);
};

const returnTokens = async (userId: string, model: string) => {
  const dayTtl = getSecondsUntilMidnightPT();
  const todayPT = getCurrentDatePT();

  const pipeline = redis.pipeline();

  // Model RPM
  pipeline.decrby(redisKeys.modelRpm(model), 1);
  pipeline.expire(redisKeys.modelRpm(model), MINUTE_TTL);

  // Model RPD
  pipeline.decrby(redisKeys.modelRpd(model), 1);
  pipeline.expire(redisKeys.modelRpd(model), dayTtl);

  // User RPM
  pipeline.decrby(redisKeys.userModelRpm(userId, model), 1);
  pipeline.expire(redisKeys.userModelRpm(userId, model), MINUTE_TTL);

  // User RPD (Fixed Window)
  pipeline.decrby(redisKeys.userModelRpd(userId, model, todayPT), 1);

  await pipeline.exec();
};

const worker = new Worker(
  env.queueName,
  async (job) => {
    const {
      userId,
      model, // 💡 Це модель, за яку списано токени
      payload,
    } = job.data as any;
    const jobId = job.id as string;

    await redis.hset(redisKeys.jobMeta(jobId), {
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    });

    try {
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
    } catch (err: any & { retryable?: boolean }) {
      if (!err?.retryable) {
        await redis.hset(redisKeys.jobResult(jobId), {
          status: 'failed',
          error: err?.message || 'Unknown error',
          finished_at: new Date().toISOString(),
        });
        await removeLock(userId, jobId);
      }

      // Throw error to BullMQ, for manage retry / final failed
      throw err;
    }
  },
  { connection: { url: env.redisUrl } }
);

const queueEvents = new QueueEvents(env.queueName, {
  connection: { url: env.redisUrl },
});

queueEvents.on('failed', async ({ jobId, failedReason }) => {
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

  if (userId && model) {
    await returnTokens(userId, model);
  }

  if (userId) {
    await removeLock(userId, jobId as string);
  }

  await redis.hset(redisKeys.jobResult(jobId as string), {
    status: 'failed',
    error: failedReason,
    finished_at: new Date().toISOString(),
  });
});

const shutdown = async () => {
  await worker.close();
  await queueEvents.close();
  await queue.close();
  await redis.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
