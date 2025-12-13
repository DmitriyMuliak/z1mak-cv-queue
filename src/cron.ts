import { createRedisClient } from './redis/client';
import { redisKeys } from './redis/keys';
import { supabaseClient } from './db/client';
import { Queue } from 'bullmq';
import { env } from './config/env';
import { getCurrentDatePT, getSecondsUntilMidnightPT } from './utils/time';

const redis = createRedisClient();

const MODEL_RELOAD_MS = 5 * 60 * 1000;
const DB_SYNC_MS = 30 * 1000;
const ORPHAN_CLEAN_MS = 60 * 60 * 1000;
const EXPIRE_CHECK_MS = 60 * 1000;
const EXPIRE_SLA_MS = 30 * 60 * 1000; // 30 minutes SLA for queue wait/active
const MINUTE_TTL = 70;

let modelTimer: NodeJS.Timeout | undefined;
let syncTimer: NodeJS.Timeout | undefined;
let cleanupTimer: NodeJS.Timeout | undefined;
let expireTimer: NodeJS.Timeout | undefined;
let warnedModelSkip = false;
let warnedDbSyncSkip = false;

const queueLite = new Queue(env.queueLiteName, { connection: { url: env.redisUrl } });
const queueHard = new Queue(env.queueHardName, { connection: { url: env.redisUrl } });

export const startCron = async () => {
  await reloadModelLimits();
  modelTimer = setInterval(reloadModelLimits, MODEL_RELOAD_MS);

  await syncDbResults();
  syncTimer = setInterval(syncDbResults, DB_SYNC_MS);

  await cleanupOrphanLocks();
  cleanupTimer = setInterval(cleanupOrphanLocks, ORPHAN_CLEAN_MS);

  await expireStaleJobs();
  expireTimer = setInterval(expireStaleJobs, EXPIRE_CHECK_MS);
};

export const stopCron = async () => {
  if (modelTimer) clearInterval(modelTimer);
  if (syncTimer) clearInterval(syncTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  if (expireTimer) clearInterval(expireTimer);
  modelTimer = undefined;
  syncTimer = undefined;
  cleanupTimer = undefined;
  expireTimer = undefined;

  await redis.quit();
  await supabaseClient.end();
  await queueLite.close();
  await queueHard.close();
};

const scanKeys = async (pattern: string, count = 500): Promise<string[]> => {
  let cursor = '0';
  const keys: string[] = [];
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = next;
    if (batch.length) keys.push(...batch);
  } while (cursor !== '0');
  return keys;
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

  const keys = await scanKeys('job:*:result');
  if (keys.length === 0) return;

  const client = await supabaseClient.connect();
  try {
    const chunkSize = 200;
    for (let offset = 0; offset < keys.length; offset += chunkSize) {
      const slice = keys.slice(offset, offset + chunkSize);
      const rows: any[] = [];
      const keysToDelete: Array<{ resultKey: string; metaKey: string }> = [];
      for (const resultKey of slice) {
        const jobId = resultKey.split(':')[1];
        const meta = await redis.hgetall(redisKeys.jobMeta(jobId));
        const result = await redis.hgetall(resultKey);

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
    }
  } finally {
    await client.release();
  }
};

const cleanupOrphanLocks = async () => {
  const keys = await scanKeys('user:*:active_jobs');
  if (keys.length === 0) return;

  const now = Date.now();
  const pipeline = redis.pipeline();

  for (const key of keys) {
    pipeline.zremrangebyscore(key, '-inf', now);
  }

  await pipeline.exec();
};

const safeJsonParse = (val: string | undefined) => {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
};

const expireStaleJobs = async () => {
  const now = Date.now();
  const dayTtl = getSecondsUntilMidnightPT();
  const queues = [
    { queue: queueLite, type: 'lite' as const },
    { queue: queueHard, type: 'hard' as const },
  ];

  for (const { queue, type } of queues) {
    // 'active' need for case when worker fall down after consume limits but before failed/completed
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active'], 0, 500);
    for (const job of jobs) {
      if (!job) continue;
      const ageMs = now - (job.timestamp ?? now);
      if (ageMs <= EXPIRE_SLA_MS) continue;

      const data = job.data as any;
      const userId = data?.userId;
      const model = data?.model;
      const jobId = job.id as string;

      const meta = await redis.hgetall(redisKeys.jobMeta(jobId));
      const tokensConsumed = meta.tokens_consumed === 'true';
      const modelForTokens = model || meta.processed_model || meta.requested_model;
      const state = await job.getState();
      const isActive = state === 'active';

      // Remove only waiting/delayed jobs; leave active ones to avoid clashing with a running worker
      if (!isActive) {
        await job.remove();
      }

      // For stale active jobs only return limits and mark status; do not touch BullMQ job entry
      if (tokensConsumed && modelForTokens) {
        await redis.returnTokensAtomic(
          [
            redisKeys.modelRpm(modelForTokens),
            redisKeys.modelRpd(modelForTokens),
            '__nil__',
          ],
          [1, MINUTE_TTL, dayTtl, 0]
        );
      }

      const finishedAt = new Date().toISOString();
      const updatedAt = finishedAt;
      const waitingKey =
        !isActive && model ? redisKeys.queueWaitingModel(model) : '__nil__';
      const activeKey = userId ? redisKeys.userActiveJobs(userId) : '__nil__';
      const rpdKey = userId
        ? redisKeys.userTypeRpd(userId, type, getCurrentDatePT())
        : '__nil__';

      await redis.expireStaleJob(
        [
          waitingKey,
          activeKey,
          rpdKey,
          redisKeys.jobResult(jobId),
          redisKeys.jobMeta(jobId),
        ],
        [dayTtl, finishedAt, updatedAt, 'failed', 'expired', 'expired', jobId]
      );
    }
  }
};

// Exposed for unit tests
export const __test = {
  reloadModelLimits,
  syncDbResults,
  cleanupOrphanLocks,
  expireStaleJobs,
  scanKeys,
};
