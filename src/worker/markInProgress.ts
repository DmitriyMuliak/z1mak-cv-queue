import { redisKeys } from '../redis/keys';
import type { RedisWithScripts } from '../redis/client';

export const createMarkInProgress = (redis: RedisWithScripts) => {
  return async (jobId: string) => {
    const now = new Date().toISOString();
    await redis.hset(redisKeys.jobMeta(jobId), {
      status: 'in_progress',
      updated_at: now,
    });
  };
};
