import { createRedisClient } from './redis/client';
import { redisKeys } from './redis/keys';
import { supabaseClient } from './db/client';

const redis = createRedisClient();

const MODEL_RELOAD_MS = 5 * 60 * 1000;
const DB_SYNC_MS = 30 * 1000;
const ORPHAN_CLEAN_MS = 60 * 60 * 1000;

let modelTimer: NodeJS.Timeout | undefined;
let syncTimer: NodeJS.Timeout | undefined;
let cleanupTimer: NodeJS.Timeout | undefined;
let warnedModelSkip = false;
let warnedDbSyncSkip = false;

export const startCron = async () => {
  await reloadModelLimits();
  modelTimer = setInterval(reloadModelLimits, MODEL_RELOAD_MS);

  await syncDbResults();
  syncTimer = setInterval(syncDbResults, DB_SYNC_MS);

  await cleanupOrphanLocks();
  cleanupTimer = setInterval(cleanupOrphanLocks, ORPHAN_CLEAN_MS);
};

export const stopCron = async () => {
  if (modelTimer) clearInterval(modelTimer);
  if (syncTimer) clearInterval(syncTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  modelTimer = undefined;
  syncTimer = undefined;
  cleanupTimer = undefined;

  await redis.quit();
  await supabaseClient.end();
};

const reloadModelLimits = async () => {
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

const syncDbResults = async () => {
  if (supabaseClient.isMock) {
    if (!warnedDbSyncSkip) {
      console.warn('[Cron] Supabase not configured, skipping DB sync of job results.');
      warnedDbSyncSkip = true;
    }
    return;
  }

  const keys = await redis.keys('job:*:result');
  if (keys.length === 0) return;

  const client = await supabaseClient.connect();
  try {
    for (const resultKey of keys) {
      const jobId = resultKey.split(':')[1];
      const meta = await redis.hgetall(redisKeys.jobMeta(jobId));
      const result = await redis.hgetall(resultKey);

      await client.query(
        `
        INSERT INTO job (id, user_id, resume_id, requested_model, processed_model, status, result, error, created_at, finished_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            result = EXCLUDED.result,
            error = EXCLUDED.error,
            finished_at = EXCLUDED.finished_at,
            processed_model = EXCLUDED.processed_model
        `,
        [
          jobId,
          meta.user_id || null,
          meta.resume_id || null,
          meta.requested_model || null,
          meta.processed_model || null,
          result.status || meta.status || 'unknown',
          safeJsonParse(result.data),
          result.error || null,
          meta.created_at || new Date().toISOString(),
          result.finished_at || null,
        ]
      );

      await redis.del(resultKey, redisKeys.jobMeta(jobId));
    }
  } finally {
    await client.release();
  }
};

const cleanupOrphanLocks = async () => {
  const keys = await redis.keys('user:*:active_jobs');

  await Promise.all(
    keys.map(async (key) => {
      const jobs = await redis.zrange(key, 0, -1);

      if (jobs.length === 0) return;

      const pipeline = redis.pipeline();
      let jobsToClean: string[] = [];

      for (const jobId of jobs) {
        pipeline.exists(redisKeys.jobResult(jobId));
        jobsToClean.push(jobId);
      }

      const results = (await pipeline.exec()) ?? [];
      const cleanPipeline = redis.pipeline();

      for (let i = 0; i < results.length; i++) {
        const [err, exists] = results[i];
        if (err) {
          console.error(
            `Error checking job result existence for ${jobsToClean[i]}:`,
            err
          );
          continue;
        }
        if (exists) {
          cleanPipeline.zrem(key, jobsToClean[i]);
        }
      }

      await cleanPipeline.exec();
    })
  );
};

const safeJsonParse = (val: string | undefined) => {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
};
