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
    'enforces model RPM under burst load',
    async () => {
      // Allow 50 per minute for the model; user is admin to avoid user-level caps.
      await seedModelLimits(redis, 'flashLite', 50, 10_000);
      const body = { ...createBody('lite'), userId: 'burst-admin', role: 'admin' as const };

      const results = await parallelCalls(60, () => postJob(body));
      const successes = results.filter((r) => r.status === 200);
      const failures = results.filter((r) => r.status === 429);

      expect(successes.length).toBe(50);
      expect(failures.length).toBe(10);
      expect(failures.every((r) => r.json.error === 'MODEL_LIMIT')).toBe(true);
    },
    60_000
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
    'handles 10k parallel requests across many users respecting model RPD',
    async () => {
      // Model allows 1000/day, user defaults are high enough not to interfere.
      await seedModelLimits(redis, 'flashLite', 10_000, 1000);

      // Send 10k requests in batches to avoid connection saturation on the test host.
      // For real 10k requests need to use k6/Artillery/Gatling/Vegeta with VUs = 10k
      const results = await runInBatches(10_000, 100, (i) =>
        postJob({ ...createBody('lite'), userId: `user-${i}`, role: 'admin' })
      );

      const successes = results.filter((r) => r.status === 200);
      const failures = results.filter((r) => r.status === 429);

      expect(successes.length).toBe(1000);
      expect(failures.length).toBe(9000);
      expect(failures.every((r) => r.json.error === 'MODEL_LIMIT')).toBe(true);
    },
    120_000
  );
});
