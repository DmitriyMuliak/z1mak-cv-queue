import { Queue } from 'bullmq';
import { createRedisClient } from '../redis/client';
import { db } from '../db/client';
import { env } from '../config/env';
import { createReloadModelLimits } from './reloadModelLimits';
import { createSyncDbResults } from './syncDbResults';
import { createCleanupOrphanLocks } from './cleanupOrphanLocks';
import { createExpireStaleJobs } from './expireStaleJobs';
import { runWithLock } from './utils/runWithLock';

const MODEL_RELOAD_MS = 5 * 60 * 1000;
const DB_SYNC_MS = 30 * 1000;
const ORPHAN_CLEAN_MS = 60 * 60 * 1000;
const EXPIRE_CHECK_MS = 60 * 1000;
const EXPIRE_SLA_MS = 30 * 60 * 1000; // 30 minutes SLA for queue wait/active
const MINUTE_TTL = 70;

const redis = createRedisClient();
const queueLite = new Queue(env.queueLiteName, { connection: { url: env.redisUrl } });
const queueHard = new Queue(env.queueHardName, { connection: { url: env.redisUrl } });

let modelTimer: NodeJS.Timeout | undefined;
let syncTimer: NodeJS.Timeout | undefined;
let cleanupTimer: NodeJS.Timeout | undefined;
let expireTimer: NodeJS.Timeout | undefined;

const reloadModelLimits = createReloadModelLimits({ redis, db });
const syncDbResults = createSyncDbResults({ redis, db });
const cleanupOrphanLocks = createCleanupOrphanLocks({ redis });
const expireStaleJobs = createExpireStaleJobs({
  redis,
  queues: { lite: queueLite, hard: queueHard },
  minuteTtl: MINUTE_TTL,
  expireSlaMs: EXPIRE_SLA_MS,
});

const start = async () => {
  await runWithLock(redis, 'reloadModelLimits', MODEL_RELOAD_MS, reloadModelLimits);
  // TODO: remove reloadModelLimits cron and use web hook (call /admin/update-models-limits)
  modelTimer = setInterval(
    () => runWithLock(redis, 'reloadModelLimits', MODEL_RELOAD_MS, reloadModelLimits),
    MODEL_RELOAD_MS
  );

  await runWithLock(redis, 'syncDbResults', DB_SYNC_MS, syncDbResults);
  syncTimer = setInterval(
    () => runWithLock(redis, 'syncDbResults', DB_SYNC_MS, syncDbResults),
    DB_SYNC_MS
  );

  await runWithLock(redis, 'cleanupOrphanLocks', ORPHAN_CLEAN_MS, cleanupOrphanLocks);
  cleanupTimer = setInterval(
    () => runWithLock(redis, 'cleanupOrphanLocks', ORPHAN_CLEAN_MS, cleanupOrphanLocks),
    ORPHAN_CLEAN_MS
  );

  await runWithLock(redis, 'expireStaleJobs', EXPIRE_CHECK_MS, expireStaleJobs);
  expireTimer = setInterval(
    () => runWithLock(redis, 'expireStaleJobs', EXPIRE_CHECK_MS, expireStaleJobs),
    EXPIRE_CHECK_MS
  );
};

const stop = async () => {
  if (modelTimer) clearInterval(modelTimer);
  if (syncTimer) clearInterval(syncTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  if (expireTimer) clearInterval(expireTimer);
  modelTimer = undefined;
  syncTimer = undefined;
  cleanupTimer = undefined;
  expireTimer = undefined;

  await queueLite.close();
  await queueHard.close();
  await redis.quit();
};

export type CronService = typeof cronService;

export const cronService = {
  start,
  stop,
};

// Exposed for unit tests
export const __test = {
  reloadModelLimits,
  syncDbResults,
  cleanupOrphanLocks,
  expireStaleJobs,
};
