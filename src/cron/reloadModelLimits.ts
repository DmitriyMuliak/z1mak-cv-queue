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
      api_name: string;
      rpm: number;
      rpd: number;
      updated_at?: Date;
    }>(
      'SELECT id, api_name, rpm, rpd, updated_at FROM ai_models ORDER BY fallback_priority ASC'
    );

    const pipeline = redis.pipeline();
    pipeline.del(redisKeys.modelIds());
    if (res.rows.length > 0) {
      pipeline.sadd(
        redisKeys.modelIds(),
        ...res.rows.map((row) => row.id)
      );
    }

    for (const row of res.rows) {
      pipeline.hset(redisKeys.modelLimits(row.id), {
        api_name: row.api_name,
        rpm: row.rpm,
        rpd: row.rpd,
        updated_at: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
      });
    }

    await pipeline.exec();
  };
};
