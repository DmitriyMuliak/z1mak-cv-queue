import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';
import { safeJsonParse } from './utils/safeJsonParse';
import { scanKeys } from './utils/scanKeys';

const SYNCED_DATA_TTL_SECONDS = 300; // keep hot results in Redis for 5 minutes post-sync

type CreateSyncDeps = {
  redis: RedisWithScripts;
  db: DbClient;
};

export const createSyncDbResults = ({ redis, db }: CreateSyncDeps) => {
  return async () => {
    const started = Date.now();
    let processed = 0;
    const keys = await scanKeys(redis, 'job:*:result');
    if (keys.length === 0) return;

    // Use withClient to avoid reopening connections per chunk
    await db.withClient(async (client) => {
      const chunkSize = 100; // Slightly smaller for Nano to avoid memory pressure

      for (let offset = 0; offset < keys.length; offset += chunkSize) {
        const slice = keys.slice(offset, offset + chunkSize);

        // --- 1. Batched Redis read ---
        const pipeline = redis.pipeline();
        for (const resultKey of slice) {
          const jobId = resultKey.split(':')[1];
          pipeline.hgetall(redisKeys.jobMeta(jobId));
          pipeline.hgetall(resultKey);
        }
        const redisResults = await pipeline.exec();
        // Guard clause: if Redis returned null, we cannot continue this chunk
        if (!redisResults) {
          throw new Error('[Redis] Pipeline exec returned null');
        }

        const rows: JobRow[] = [];
        const keysToExpire: string[] = [];
        const syncedResultKeys: string[] = [];

        // --- 2. Parse results ---
        for (let i = 0; i < slice.length; i++) {
          const resultKey = slice[i];
          const jobId = resultKey.split(':')[1];
          // redisResults[i*2] - meta, redisResults[i*2 + 1] - result
          const meta = redisResults[i * 2][1] as RedisHash | null;
          const result = redisResults[i * 2 + 1][1] as RedisHash | null;

          const metaEmpty = !meta || Object.keys(meta).length === 0;
          const resultEmpty = !result || Object.keys(result).length === 0;

          if (metaEmpty || resultEmpty) {
            console.warn(
              `[Cron] syncDbResults skipping job ${jobId} — metaEmpty=${metaEmpty}, resultEmpty=${resultEmpty}`
            );
            keysToExpire.push(resultKey, redisKeys.jobMeta(jobId));
            continue;
          }

          if (result.synced_at) {
            continue;
          }

          rows.push({
            jobId,
            user_id: meta.user_id || null,
            resume_id: meta.resume_id || null,
            requested_model: meta.requested_model || null,
            processed_model: meta.processed_model || null,
            status: result.status || meta.status || 'unknown',
            result: safeJsonParse<JsonValue>(result.data),
            error: result.error || null,
            error_code: result.error_code || null,
            created_at: meta.created_at || new Date().toISOString(),
            finished_at: result.finished_at || null,
            expired_at: result.expired_at || null,
          });
          keysToExpire.push(resultKey, redisKeys.jobMeta(jobId));
          syncedResultKeys.push(resultKey);
        }

        if (rows.length === 0) {
          if (keysToExpire.length > 0) {
            const expirePipeline = redis.pipeline();
            for (const key of keysToExpire) {
              expirePipeline.expire(key, SYNCED_DATA_TTL_SECONDS);
            }
            await expirePipeline.exec();
          }
          continue;
        }

        // --- 3. Batched DB insert ---
        const values: SqlValue[] = [];
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
          INSERT INTO cv_analyzes (id, user_id, resume_id, requested_model, processed_model, status, result, error, error_code, created_at, finished_at, expired_at)
          VALUES ${placeholders}
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            result = EXCLUDED.result,
            error = EXCLUDED.error,
            error_code = EXCLUDED.error_code,
            finished_at = EXCLUDED.finished_at,
            processed_model = EXCLUDED.processed_model,
            expired_at = EXCLUDED.expired_at
        `,
          values
        );

        // --- 4. Mark as synced and expire Redis data to keep it hot for a short window ---
        if (keysToExpire.length > 0 || syncedResultKeys.length > 0) {
          const expirePipeline = redis.pipeline();
          const syncedAt = new Date().toISOString();
          for (const resultKey of syncedResultKeys) {
            expirePipeline.hset(resultKey, { synced_at: syncedAt });
          }
          for (const key of keysToExpire) {
            expirePipeline.expire(key, SYNCED_DATA_TTL_SECONDS);
          }
          await expirePipeline.exec();
        }
        processed += rows.length;
      }
    });

    console.info(
      `[Cron] syncDbResults processed ${processed} rows in ${Date.now() - started}ms`
    );
  };
};

type DbClient = typeof import('../db/client').db;

type RedisHash = Record<string, string>;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type JobRow = {
  jobId: string;
  user_id: string | null;
  resume_id: string | null;
  requested_model: string | null;
  processed_model: string | null;
  status: string;
  result: JsonValue | null;
  error: string | null;
  error_code: string | null;
  created_at: string;
  finished_at: string | null;
  expired_at: string | null;
};

type SqlValue = JobRow[keyof JobRow];
