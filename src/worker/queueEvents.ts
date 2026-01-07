import { QueueEvents, Queue } from 'bullmq';
import { redisKeys } from '../redis/keys';
import type { RedisWithScripts } from '../redis/client';
import type { ModeType } from './concurrencyManager';
import { JOB_KEY_TTL_SECONDS } from '../constants/jobKeys';

type QueueEventsDeps = {
  redis: RedisWithScripts;
  queues: Record<ModeType, Queue>;
  returnTokens: (model: string) => Promise<void>;
};

export const createQueueEventsRegistrar = ({
  redis,
  queues,
  returnTokens,
}: QueueEventsDeps) => {
  return (queueEvent: QueueEvents, queueType: ModeType) => {
    queueEvent.on('completed', async ({ jobId }) => {
      const queue = queues[queueType];
      const job = await queue.getJob(jobId);
      const state = job ? await job.getState() : 'unknown';
      const attemptsMade = job?.attemptsMade ?? 0;
      console.info(
        `[QueueEvents:${queueType}] completed job ${jobId} state=${state} attempts=${attemptsMade}`
      );
    });

    queueEvent.on('failed', async ({ jobId, failedReason }) => {
      const queue = queues[queueType];
      const job = await queue.getJob(jobId);
      const state = job ? await job.getState() : 'missing';
      if (!job) {
        console.warn(
          `[QueueEvents:${queueType}] failed event but job not found: ${jobId}`
        );
      }
      const attemptsMade = job?.attemptsMade ?? 0;
      const maxAttempts = job?.opts.attempts ?? 1;
      const isFinalAttempt = job ? attemptsMade >= maxAttempts : true;

      console.warn(
        `[QueueEvents:${queueType}] failed job ${jobId} state=${state} attempts=${attemptsMade}/${maxAttempts} reason=${failedReason}`
      );

      if (!isFinalAttempt) {
        return;
      }

      const meta = await redis.hgetall(redisKeys.jobMeta(jobId));

      if (!meta || Object.keys(meta).length === 0) {
        console.warn(`[QueueEvents] No metadata for job ${jobId} — skipping.`);
        return;
      }

      const userId = meta.user_id;
      const model = meta.processed_model || meta.requested_model;
      const tokensConsumed = meta.tokens_consumed === 'true';
      const providerCompleted = meta.provider_completed === 'true';

      // Return tokens only if they were consumed but provider call did not complete (e.g., failed before/at provider)
      if (userId && model && tokensConsumed && !providerCompleted) {
        await returnTokens(model);
      }

      const reason = failedReason || 'provider_error';
      const limitReasons = new Set(['MODEL_RPD_EXCEEDED', 'USER_RPD_EXCEEDED']);
      const errorCode = limitReasons.has(reason) ? 'limit' : 'provider_error';
      const failedAt = new Date().toISOString();

      const pipe = redis.pipeline();
      pipe.hset(redisKeys.jobResult(jobId), {
        status: 'failed',
        error: reason,
        error_code: errorCode,
        finished_at: failedAt,
      });
      pipe.hset(redisKeys.jobMeta(jobId), {
        status: 'failed',
        updated_at: failedAt,
      });
      pipe.expire(redisKeys.jobResult(jobId), JOB_KEY_TTL_SECONDS);
      pipe.expire(redisKeys.jobMeta(jobId), JOB_KEY_TTL_SECONDS);
      if (userId) {
        pipe.zrem(redisKeys.userActiveJobs(userId), jobId);
      }
      await pipe.exec();
      if (model) {
        await redis.decrAndClampToZero([redisKeys.queueWaitingModel(model)]);
      }
    });
  };
};
