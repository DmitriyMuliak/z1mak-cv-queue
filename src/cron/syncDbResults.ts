import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';
import { safeJsonParse } from './utils/safeJsonParse';
import { scanKeys } from './utils/scanKeys';

type SupabaseClient = typeof import('../db/client').supabaseClient;

type CreateSyncDeps = {
  redis: RedisWithScripts;
  supabaseClient: SupabaseClient;
};

export const createSyncDbResults = ({ redis, supabaseClient }: CreateSyncDeps) => {
  let warnedDbSyncSkip = false;

  return async () => {
    if (supabaseClient.isMock) {
      if (!warnedDbSyncSkip) {
        console.warn('[Cron] Supabase not configured, skipping DB sync of job results.');
        warnedDbSyncSkip = true;
      }
      return;
    }

    const started = Date.now();
    let processed = 0;
    const keys = await scanKeys(redis, 'job:*:result');
    if (keys.length === 0) return;

    const client = await supabaseClient.connect();
    try {
      const chunkSize = 200;
      for (let offset = 0; offset < keys.length; offset += chunkSize) {
        const slice = keys.slice(offset, offset + chunkSize);
        const rows: any[] = [];
        const keysToDelete: Array<{ resultKey: string; metaKey: string }> = [];
        for (const resultKey of slice) {
          try {
            const jobId = resultKey.split(':')[1];
            const meta = await redis.hgetall(redisKeys.jobMeta(jobId));
            const result = await redis.hgetall(resultKey);

            if (!meta || !result || Object.keys(result).length === 0) {
              keysToDelete.push({ resultKey, metaKey: redisKeys.jobMeta(jobId) });
              continue;
            }

            rows.push({
              jobId,
              user_id: meta.user_id || null,
              resume_id: meta.resume_id || null,
              requested_model: meta.requested_model || null,
              processed_model: meta.processed_model || null,
              status: result.status || meta.status || 'unknown',
              result: safeJsonParse(result.data),
              error: result.error || null,
              error_code: result.error_code || null,
              created_at: meta.created_at || new Date().toISOString(),
              finished_at: result.finished_at || null,
              expired_at: result.expired_at || null,
            });
            keysToDelete.push({ resultKey, metaKey: redisKeys.jobMeta(jobId) });
          } catch (err) {
            console.warn(`[Cron] syncDbResults skipped key ${resultKey}:`, err);
          }
        }

        if (rows.length === 0) continue;

        const values: any[] = [];
        const placeholders = rows
          .map((row, idx) => {
            const base = idx * 12;
            values.push(
              row.jobId,
              row.user_id,
              row.resume_id,
              row.requested_model,
              row.processed_model,
              row.status,
              row.result,
              row.error,
              row.error_code,
              row.created_at,
              row.finished_at,
              row.expired_at
            );
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
          })
          .join(', ');

        await client.query(
          `
        INSERT INTO job (id, user_id, resume_id, requested_model, processed_model, status, result, error, error_code, created_at, finished_at, expired_at)
        VALUES ${placeholders}
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            result = EXCLUDED.result,
            error = EXCLUDED.error,
            error_code = EXCLUDED.error_code,
            finished_at = EXCLUDED.finished_at,
            processed_model = EXCLUDED.processed_model,
            expired_at = EXCLUDED.expired_at
        `,
          values
        );

        const delPipeline = redis.pipeline();
        for (const keyPair of keysToDelete) {
          delPipeline.del(keyPair.resultKey, keyPair.metaKey);
        }
        await delPipeline.exec();
        processed += rows.length;
      }
    } finally {
      await client.release();
      console.info(
        `[Cron] syncDbResults processed ${processed} rows in ${Date.now() - started}ms`
      );
    }
  };
};
