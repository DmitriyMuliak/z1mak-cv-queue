import { createRedisClient } from "./redis/client";
import { redisKeys } from "./redis/keys";
import { pool } from "./db/client";
import { env } from "./config/env";

const redis = createRedisClient();

const MODEL_RELOAD_MS = 5 * 60 * 1000;
const DB_SYNC_MS = 30 * 1000;
const ORPHAN_CLEAN_MS = 60 * 60 * 1000;

let modelTimer: NodeJS.Timeout | undefined;
let syncTimer: NodeJS.Timeout | undefined;
let cleanupTimer: NodeJS.Timeout | undefined;

const start = async () => {
  await reloadModelLimits();
  modelTimer = setInterval(reloadModelLimits, MODEL_RELOAD_MS);

  await syncDbResults();
  syncTimer = setInterval(syncDbResults, DB_SYNC_MS);

  await cleanupOrphanLocks();
  cleanupTimer = setInterval(cleanupOrphanLocks, ORPHAN_CLEAN_MS);
};

const reloadModelLimits = async () => {
  if (!pool) return;
  const res = await pool.query(
    "SELECT id, rpm, rpd, updated_at FROM ai_models ORDER BY fallback_priority ASC"
  );

  for (const row of res.rows) {
    await redis.hset(redisKeys.modelLimits(row.id), {
      rpm: row.rpm,
      rpd: row.rpd,
      updated_at: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
    });
  }
};

const syncDbResults = async () => {
  if (!pool) return;
  const keys = await redis.keys("job:*:result");
  if (keys.length === 0) return;

  const client = await pool.connect();
  try {
    for (const resultKey of keys) {
      const jobId = resultKey.split(":")[1];
      const meta = await redis.hgetall(redisKeys.jobMeta(jobId));
      const result = await redis.hgetall(resultKey);

      await client.query(
        `
        INSERT INTO job (id, user_id, resume_id, model, status, result, error, created_at, finished_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            result = EXCLUDED.result,
            error = EXCLUDED.error,
            finished_at = EXCLUDED.finished_at
        `,
        [
          jobId,
          meta.user_id || null,
          meta.resume_id || null,
          meta.model || null,
          result.status || meta.status || "unknown",
          safeJsonParse(result.data),
          result.error || null,
          meta.created_at || new Date().toISOString(),
          result.finished_at || null,
        ]
      );

      await redis.del(resultKey, redisKeys.jobMeta(jobId));
    }
  } finally {
    client.release();
  }
};

const cleanupOrphanLocks = async () => {
  const keys = await redis.keys("user:*:active_jobs");
  for (const key of keys) {
    const jobs = await redis.zrange(key, 0, -1);
    for (const jobId of jobs) {
      const resultExists = await redis.exists(redisKeys.jobResult(jobId));
      if (resultExists) {
        await redis.zrem(key, jobId);
      }
    }
  }
};

const safeJsonParse = (val: string | undefined) => {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
};

const shutdown = async () => {
  if (modelTimer) clearInterval(modelTimer);
  if (syncTimer) clearInterval(syncTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  await redis.quit();
  if (pool) await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void start().catch((err) => {
  console.error("Cron failed to start", err);
  process.exit(1);
});
