import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';

type SupabaseClient = typeof import('../db/client').supabaseClient;

type CreateReloadDeps = {
  redis: RedisWithScripts;
  supabaseClient: SupabaseClient;
};

export const createReloadModelLimits = ({ redis, supabaseClient }: CreateReloadDeps) => {
  let warnedModelSkip = false;

  return async () => {
    if (supabaseClient.isMock) {
      if (!warnedModelSkip) {
        console.warn('[Cron] Supabase not configured, skipping model limits reload.');
        warnedModelSkip = true;
      }
      return;
    }

    const res = await supabaseClient.query<{
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
