import type { Redis } from 'ioredis';
import { redisKeys } from '../redis/keys';

export interface UserLimits {
  hard_rpd: number | null;
  lite_rpd: number | null;
  max_concurrency: number | null;
  unlimited: boolean;
  role: 'user' | 'admin';
}

const defaultUserLimits: UserLimits = {
  hard_rpd: 1,
  lite_rpd: 9,
  max_concurrency: 2,
  unlimited: false,
  role: 'user',
};

const defaultAdminLimits: UserLimits = {
  hard_rpd: null,
  lite_rpd: null,
  max_concurrency: null,
  unlimited: true,
  role: 'admin',
};

export const getCachedUserLimits = async (
  redis: Redis,
  userId: string,
  role: 'user' | 'admin'
): Promise<UserLimits> => {
  const key = redisKeys.userLimits(userId);
  const cached = await redis.hgetall(key);

  if (cached && Object.keys(cached).length > 0) {
    return {
      role: (cached.role as UserLimits['role']) ?? role,
      hard_rpd: cached.hard_rpd ? Number(cached.hard_rpd) : null,
      lite_rpd: cached.lite_rpd ? Number(cached.lite_rpd) : null,
      max_concurrency: cached.max_concurrency ? Number(cached.max_concurrency) : null,
      unlimited: cached.unlimited === 'true',
    };
  }

  const limits = role === 'admin' ? defaultAdminLimits : defaultUserLimits;

  await redis.hset(key, {
    role: limits.role,
    hard_rpd: limits.hard_rpd ?? '',
    lite_rpd: limits.lite_rpd ?? '',
    max_concurrency: limits.max_concurrency ?? '',
    unlimited: String(limits.unlimited),
  });

  return limits;
};
