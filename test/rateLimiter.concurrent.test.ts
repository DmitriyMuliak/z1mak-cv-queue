import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import {
  createBody,
  createRedis,
  configureMockGemini,
  seedModelLimits,
  postJob,
  startCompose,
  stopCompose,
  waitForApi,
  redisKeys,
} from './utils/rateTestUtils';

const parallelCalls = async <T>(count: number, fn: (i: number) => Promise<T>) => {
  const jobs: Array<Promise<T>> = [];
  for (let i = 0; i < count; i++) {
    jobs.push(fn(i));
  }
  return Promise.all(jobs);
};

const runInBatches = async <T>(
  total: number,
  batchSize: number,
  fn: (i: number) => Promise<T>
) => {
  const results: T[] = [];
  for (let offset = 0; offset < total; offset += batchSize) {
    const current = Math.min(batchSize, total - offset);
    const batch = parallelCalls(current, (idx) => fn(offset + idx));
    results.push(...(await batch));
  }
  return results;
};

describe('Rate limiter concurrency bursts', () => {
  let redis: Redis;

  beforeAll(async () => {
    await startCompose();
    redis = createRedis();
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });
    await waitForApi();
  }, 180_000);

  afterAll(async () => {
    await redis?.quit();
    await stopCompose();
  }, 60_000);

  beforeEach(async () => {
    await redis.flushall();
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });
  });

  it(
    'accepts burst even when model RPM is low (worker will throttle)',
    async () => {
      await seedModelLimits(redis, 'flashLite', 100, 10000);
      const body = { ...createBody('lite'), userId: 'burst-admin', role: 'admin' as const };

      const results = await parallelCalls(5, () => postJob(body));
      expect(results.every((r) => r.status === 200)).toBe(true);
    },
    30_000
  );

  it(
    'enforces user RPD with many parallel calls',
    async () => {
      await seedModelLimits(redis, 'flashLite', 10_000, 10_000); // high model limits
      await redis.hset(redisKeys.userLimits('burst-user'), {
        role: 'user',
        hard_rpd: 5,
        lite_rpd: 5,
        max_concurrency: 50,
        unlimited: 'false',
      });

      const base = createBody('lite');
      base.userId = 'burst-user';

      const results = await parallelCalls(20, () => postJob(base));
      const successes = results.filter((r) => r.status === 200);
      const failures = results.filter((r) => r.status === 429);

      expect(successes.length).toBe(5);
      expect(failures.length).toBe(15);
      expect(failures.every((r) => r.json.error === 'USER_RPD_LIMIT')).toBe(true);
    },
    60_000
  );

  it(
    'enforces user max_concurrency on burst',
    async () => {
      await seedModelLimits(redis, 'flashLite', 10_000, 10_000);
      await redis.hset(redisKeys.userLimits('conc-user'), {
        role: 'user',
        hard_rpd: 10_000,
        lite_rpd: 10_000,
        max_concurrency: 2,
        unlimited: 'false',
      });

      const base = createBody('lite');
      base.userId = 'conc-user';

      const results = await parallelCalls(10, () => postJob(base));
      const successes = results.filter((r) => r.status === 200);
      const failures = results.filter((r) => r.status === 429);

      expect(successes.length).toBeLessThanOrEqual(2);
      expect(failures.length).toBeGreaterThanOrEqual(8);
      expect(failures.every((r) => r.json.error === 'CONCURRENCY_LIMIT')).toBe(true);
    },
    60_000
  );

  it(
    'accepts many users without MODEL_LIMIT/User RPD rejections',
    async () => {
      await seedModelLimits(redis, 'flashLite', 100, 10000);
      const results = await runInBatches(200, 50, (i) =>
        postJob({ ...createBody('lite'), userId: `user-${i}`, role: 'admin' })
      );
      const failures = results.filter((r) => r.status !== 200);
      expect(failures.every((f) => f.json.error !== 'MODEL_LIMIT')).toBe(true);
      expect(failures.every((f) => f.json.error !== 'USER_RPD_LIMIT')).toBe(true);
      // допускаємо QUEUE_FULL, але більшість мають пройти
      const successes = results.filter((r) => r.status === 200);
      expect(successes.length).toBeGreaterThan(150);
    },
    60_000
  );
});
