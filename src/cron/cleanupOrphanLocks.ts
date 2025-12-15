import type { RedisWithScripts } from '../redis/client';
import { scanKeys } from './utils/scanKeys';

type CreateCleanupDeps = {
  redis: RedisWithScripts;
};

export const createCleanupOrphanLocks = ({ redis }: CreateCleanupDeps) => {
  return async () => {
    const keys = await scanKeys(redis, 'user:*:active_jobs');
    if (keys.length === 0) return;

    const now = Date.now();
    const pipeline = redis.pipeline();

    for (const key of keys) {
      pipeline.zremrangebyscore(key, '-inf', now);
    }

    await pipeline.exec();
  };
};
