// services/limitsPreloader.ts (Final version with pipelining)

import type { Redis } from 'ioredis';
import { db } from '../db/client';
import { redisKeys } from '../redis/keys';

interface UserLimitRow {
  user_id: string;
  role: 'user' | 'admin';
  hard_rpd: number | null;
  lite_rpd: number | null;
  max_concurrency: number | null;
  unlimited: boolean;
}

export type SyncUserLimitsFromDB = typeof syncUserLimitsFromDB;

export const syncUserLimitsFromDB = async (redis: Redis): Promise<void> => {
  const USER_LIMITS_TTL_SECONDS = 60 * 60 * 24 * 2; // 1h * 24 * 2 (2 days cache)
  let rows: UserLimitRow[] = [];
  try {
    const dbResult = await db.query<UserLimitRow>(
      `
      SELECT ul.user_id, ul.role, ul.hard_rpd, ul.lite_rpd, ul.max_concurrency, ul.unlimited
      FROM user_limits ul
      JOIN auth.users u ON u.id = ul.user_id
      ORDER BY u.created_at DESC
      LIMIT 1000
      `
    );
    rows = dbResult.rows;
  } catch (error) {
    console.error('❌ Failed to fetch limits from user_limits DB:', error);
    return;
  }

  if (rows.length === 0) {
    console.info('ℹ️ No user limits found to synchronize.');
    return;
  }

  const pipeline = redis.pipeline();

  for (const row of rows) {
    const key = redisKeys.userLimits(row.user_id);

    pipeline.hset(key, {
      role: row.role,
      hard_rpd: row.hard_rpd ?? '',
      lite_rpd: row.lite_rpd ?? '',
      max_concurrency: row.max_concurrency ?? '',
      unlimited: String(row.unlimited),
    });
    pipeline.expire(key, USER_LIMITS_TTL_SECONDS);
  }

  try {
    const results = (await pipeline.exec()) ?? [];
    const successCount = results.filter(([err]) => err === null).length;

    console.log(
      `✅ Successfully synchronized limits for ${successCount} of ${rows.length} users via pipelining.`
    );
  } catch (error) {
    console.error('❌ Critical error running Redis pipeline:', error);
  }
};
