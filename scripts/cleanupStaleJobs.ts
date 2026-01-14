/**
 * Cleanup stale BullMQ jobs + Redis job meta/result older than a cutoff (default 2h).
 *
 * Run with: `ts-node scripts/cleanupStaleJobs.ts` (ensure env is loaded).
 */
import { Queue } from 'bullmq';
import { env } from '../src/config/env';
import { createRedisClient } from '../src/redis/client';
import { redisKeys } from '../src/redis/keys';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const CUTOFF_MS = Number(process.env.CLEANUP_CUTOFF_MS ?? TWO_HOURS_MS);

const scanKeys = async (pattern: string, redis: ReturnType<typeof createRedisClient>) => {
  let cursor = '0';
  const keys: string[] = [];
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
};

const main = async () => {
  const cutoffTs = Date.now() - CUTOFF_MS;
  const redis = createRedisClient();
  const queues = [
    new Queue(env.queueLiteName, { connection: { url: env.redisUrl } }),
    new Queue(env.queueHardName, { connection: { url: env.redisUrl } }),
  ];

  await redis.connect();

  const metaKeys = await scanKeys('job:*:meta', redis);
  const staleIds: string[] = [];

  for (const key of metaKeys) {
    const jobId = key.split(':')[1];
    const meta = await redis.hgetall(key);
    if (!meta || Object.keys(meta).length === 0) continue;

    const ts =
      Date.parse(meta.updated_at ?? '') ||
      Date.parse(meta.created_at ?? '') ||
      Number.NaN;
    if (!Number.isFinite(ts)) continue;
    if (ts < cutoffTs) staleIds.push(jobId);
  }

  if (staleIds.length === 0) {
    console.log('No stale jobs found.');
    await Promise.all(queues.map((q) => q.close()));
    await redis.quit();
    return;
  }

  console.log(
    `Found ${staleIds.length} stale jobs older than ${CUTOFF_MS / 1000 / 60} minutes`
  );

  // Delete meta/result hashes
  const pipe = redis.pipeline();
  for (const id of staleIds) {
    pipe.del(redisKeys.jobMeta(id), redisKeys.jobResult(id));
  }
  await pipe.exec();

  // Remove from BullMQ (best-effort)
  for (const q of queues) {
    for (const id of staleIds) {
      try {
        const job = await q.getJob(id);
        if (job) {
          await job.remove();
        }
      } catch (err) {
        console.warn(`Failed to remove job ${id} from queue ${q.name}:`, err);
      }
    }
  }

  console.log('Cleanup done.');
  await Promise.all(queues.map((q) => q.close()));
  await redis.quit();
};

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
