// services/limitsPreloader.ts (Фінальна версія з Pipelining)

import type { Redis } from 'ioredis';
import { pool } from '../db/client';
import { redisKeys } from '../redis/keys';

interface UserLimitRow {
  user_id: string;
  role: 'user' | 'admin';
  hard_rpd: number | null;
  lite_rpd: number | null;
  max_concurrency: number | null;
  unlimited: boolean;
}

export const syncUserLimitsFromDB = async (redis: Redis): Promise<void> => {
  let rows: UserLimitRow[] = [];
  try {
    const dbResult = await pool.query<UserLimitRow>(
      `SELECT 
             user_id, role, hard_rpd, lite_rpd, max_concurrency, unlimited
           FROM user_limits`
    );
    rows = dbResult.rows;
  } catch (error) {
    console.error('❌ Помилка при отриманні лімітів з user_limits DB:', error);
    return;
  }

  if (rows.length === 0) {
    console.info('ℹ️ Не знайдено користувацьких лімітів для синхронізації.');
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
  }

  try {
    const results = (await pipeline.exec()) ?? [];

    const successCount = results.filter(([err, _]) => err === null).length;

    console.log(
      `✅ Успішно синхронізовано ліміти для ${successCount} з ${rows.length} користувачів через Pipelining.`
    );
  } catch (error) {
    console.error('❌ Критична помилка виконання Redis Pipeline:', error);
  }
};
