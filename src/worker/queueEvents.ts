import { QueueEvents, Queue } from 'bullmq';
import { redisKeys } from '../redis/keys';
import type { RedisWithScripts } from '../redis/client';
import type { ModeType } from './concurrencyManager';

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
    queueEvent.on('failed', async ({ jobId, failedReason }) => {
      const queue = queues[queueType];
      const job = await queue.getJob(jobId);
      if (!job) {
        console.warn(`[Worker] failed event but job not found: ${jobId}`);
        return;
      }
      const attemptsMade = job?.attemptsMade ?? 0;
      const maxAttempts = job?.opts.attempts ?? 1;
      const isFinalAttempt = job ? attemptsMade >= maxAttempts : true;

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
