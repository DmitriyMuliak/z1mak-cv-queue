import type { RedisWithScripts } from '../../redis/client';

const LOCK_SAFETY_MS = 10_000;

export const runWithLock = async (
  redis: RedisWithScripts,
  name: string,
  ttlMs: number,
  fn: () => Promise<void>
) => {
  const lockKey = `cron:lock:${name}`;
  const acquired = await redis.set(lockKey, '1', 'PX', ttlMs + LOCK_SAFETY_MS, 'NX');
  if (!acquired) {
    return;
  }
  const started = Date.now();
  try {
    await fn();
  } catch (err) {
    console.error(`[Cron] ${name} failed`, err);
  } finally {
    await redis.del(lockKey);
    console.info(`[Cron] ${name} completed in ${Date.now() - started}ms`);
  }
};
