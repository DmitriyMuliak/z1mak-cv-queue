import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';

type DbClient = typeof import('../db/client').db;

type CreateReloadDeps = {
  redis: RedisWithScripts;
  db: DbClient;
};

export const createReloadModelLimits = ({ redis, db }: CreateReloadDeps) => {
  return async () => {
    const res = await db.query<{
      id: string;
      rpm: number;
      rpd: number;
      updated_at?: Date;
    }>('SELECT id, rpm, rpd, updated_at FROM ai_models ORDER BY fallback_priority ASC');

    for (const row of res.rows) {
      await redis.hset(redisKeys.modelLimits(row.id), {
        rpm: row.rpm,
        rpd: row.rpd,
        updated_at: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
      });
    }
  };
};
