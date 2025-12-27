import type { Queue } from 'bullmq';
import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';
import { getCurrentDatePT, getSecondsUntilMidnightPT } from '../utils/time';

type CreateExpireDeps = {
  redis: RedisWithScripts;
  queues: { lite: Queue; hard: Queue };
  minuteTtl: number;
  expireSlaMs: number;
};

export const createExpireStaleJobs = ({
  redis,
  queues,
  minuteTtl,
  expireSlaMs,
}: CreateExpireDeps) => {
  return async () => {
    const now = Date.now();
    const dayTtl = getSecondsUntilMidnightPT();
    const queueList = [
      { queue: queues.lite, type: 'lite' as const },
      { queue: queues.hard, type: 'hard' as const },
    ];

    for (const { queue, type } of queueList) {
      // Handle only waiting/delayed jobs; let BullMQ stalled handling manage active ones
      const jobs = await queue.getJobs(['waiting', 'delayed'], 0, 500);
      for (const job of jobs) {
        if (!job) continue;
        const ageMs = now - (job.timestamp ?? now);
        if (ageMs <= expireSlaMs) continue;

        const data = job.data as any;
        const userId = data?.userId;
        const model = data?.model;
        const jobId = job.id as string;

        const meta = await redis.hgetall(redisKeys.jobMeta(jobId));
        const tokensConsumed = meta.tokens_consumed === 'true';
        const providerCompleted = meta.provider_completed === 'true';
        const modelForTokens = model || meta.processed_model || meta.requested_model;

        // Remove only waiting/delayed jobs; active ones are handled by stalled logic
        await job.remove();

        // Return limits only if they were consumed before provider completion
        if (tokensConsumed && modelForTokens && !providerCompleted) {
          await redis.returnTokensAtomic(
            [
              redisKeys.modelRpm(modelForTokens),
              redisKeys.modelRpd(modelForTokens),
              '__nil__',
            ],
            [1, minuteTtl, dayTtl, 0]
          );
        }

        const finishedAt = new Date().toISOString();
        const updatedAt = finishedAt;
        const waitingKey = model ? redisKeys.queueWaitingModel(model) : '__nil__';
        const activeKey = userId ? redisKeys.userActiveJobs(userId) : '__nil__';
        const rpdKey = userId
          ? redisKeys.userTypeRpd(userId, type, getCurrentDatePT())
          : '__nil__';

        await redis.expireStaleJob(
          [
            waitingKey,
            activeKey,
            rpdKey,
            redisKeys.jobResult(jobId),
            redisKeys.jobMeta(jobId),
          ],
          [dayTtl, finishedAt, updatedAt, 'failed', 'expired', 'expired', jobId]
        );
      }
    }
  };
};
