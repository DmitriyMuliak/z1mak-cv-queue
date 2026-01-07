import { redisKeys } from '../redis/keys';
import type { RedisWithScripts } from '../redis/client';
import { JOB_KEY_TTL_SECONDS } from '../constants/jobKeys';

export const createMarkInProgress = (redis: RedisWithScripts) => {
  return async (jobId: string) => {
    const now = new Date().toISOString();
    const metaKey = redisKeys.jobMeta(jobId);
    await redis
      .multi()
      .hset(metaKey, {
        status: 'in_progress',
        updated_at: now,
      })
      .expire(metaKey, JOB_KEY_TTL_SECONDS)
      .exec();
  };
};
