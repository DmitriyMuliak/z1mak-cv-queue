import type { Redis } from 'ioredis';
import { redisKeys } from '../redis/keys';
import { db } from '../db/client';

export interface UserLimits {
  hard_rpd: number | null;
  lite_rpd: number | null;
  max_concurrency: number | null;
  unlimited: boolean;
  role: 'user' | 'admin';
}

const defaultUserLimits: UserLimits = {
  hard_rpd: 1,
  lite_rpd: 4,
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

type UserLimitRow = {
  role: UserLimits['role'];
  hard_rpd: number | null;
  lite_rpd: number | null;
  max_concurrency: number | null;
  unlimited: boolean;
};

const toUserLimits = (row: UserLimitRow): UserLimits => ({
  role: row.role,
  hard_rpd: row.hard_rpd ?? null,
  lite_rpd: row.lite_rpd ?? null,
  max_concurrency: row.max_concurrency ?? null,
  unlimited: row.unlimited,
});

const persistLimits = async (redis: Redis, key: string, limits: UserLimits) => {
  await redis.hset(key, {
    role: limits.role,
    hard_rpd: limits.hard_rpd ?? '',
    lite_rpd: limits.lite_rpd ?? '',
    max_concurrency: limits.max_concurrency ?? '',
    unlimited: String(limits.unlimited),
  });
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

  // Can add web-hook from Supabase (auth user created)
  // Can add Supabase Realtime/PG Notify INSERT on user_limits
  try {
    const result = await db.query<UserLimitRow>(
      `
      SELECT role, hard_rpd, lite_rpd, max_concurrency, unlimited
      FROM user_limits
      WHERE user_id = $1
      LIMIT 1
    `,
      [userId]
    );

    if (result.rows.length > 0) {
      const limits = toUserLimits(result.rows[0]);
      await persistLimits(redis, key, limits);
      return limits;
    }
  } catch (error) {
    console.error('❌ Failed to fetch limits from user_limits DB:', error);
  }

  const limits = role === 'admin' ? defaultAdminLimits : defaultUserLimits;
  await persistLimits(redis, key, limits);
  return limits;
};
