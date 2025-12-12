import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import {
  createBody,
  createRedis,
  configureMockGemini,
  seedModelLimits,
  postJob,
  waitForApi,
  startCompose,
  stopCompose,
  waitForProcessedModel,
  waitForJobResult,
  redisKeys,
  RunBody,
} from '../utils/rateTestUtils';
import { getCurrentDatePT } from '../../src/utils/time';

const enqueueAndWait = async (body: RunBody, redis: Redis, timeoutMs = 1000) => {
  const res = await postJob(body);
  if (res.status === 200) {
    await waitForProcessedModel(redis, res.json.jobId, timeoutMs);
  }
  return res;
};

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

describe('Rate limiter (model RPM/RPD)', () => {
  let redis: Redis;

  beforeAll(async () => {
    await startCompose();
    redis = createRedis();
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });
    await waitForApi();
  }, 30_000);

  afterAll(async () => {
    await redis?.quit();
    await stopCompose();
  }, 30_000);

  beforeEach(async () => {
    await redis.flushall();
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });
  });

  it(
    'caps queue by model RPD when RPD=1 (second enqueue rejected)',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 1);

      await redis.hset(redisKeys.userLimits('model-rpd'), {
        role: 'user',
        hard_rpd: 100,
        lite_rpd: 1,
        max_concurrency: 10,
        unlimited: 'false',
      });

      const body = { ...createBody('lite'), userId: 'model-rpd', role: 'user' as const };

      const first = await postJob(body);
      expect(first.status).toBe(200);
      const firstResult = await waitForJobResult(redis, first.json.jobId, 30_000);
      expect(firstResult.status).toBe('completed');

      const second = await postJob(body);
      expect(second.status).toBe(429);
      expect(second.json.error).toBe('USER_RPD_LIMIT');
    },
    
  );

  it(
    'allows small bursts when model rpm is 50',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 50, 100);
      await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });

      const body = { ...createBody('lite'), userId: 'rpm-burst', role: 'admin' as const };

      const results = await Promise.all(Array.from({ length: 10 }, () => postJob(body)));
      expect(results.every((r) => r.status === 200)).toBe(true);

      const metas = await Promise.all(
        results.map((r) => waitForJobResult(redis, r.json.jobId, 5_000))
      );
      expect(metas.every((m) => m.status === 'completed')).toBe(true);
    },
    
  );

  it(
    'limits daily capacity when backlog exceeds dynamic limit',
    async () => {
      const modelId = 'flashLite';
      // RPM > RPD - skip check by rpm
      await seedModelLimits(redis, modelId, 50, 2); // 2 jobs per day
      await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });

      const body = { ...createBody('lite'), userId: 'queue-backlog', role: 'admin' as const };

      const results = await Promise.all(Array.from({ length: 4 }, () => postJob(body)));

      const accepted = results.filter((r) => r.status === 200);
      const rejected = results.filter((r) => r.status === 429);
      expect(accepted.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
      expect(
        rejected.every((r) => ['MODEL_LIMIT', 'QUEUE_FULL'].includes(r.json.error))
      ).toBe(true);

      const statuses = await Promise.all(
        accepted.map((r) => waitForJobResult(redis, r.json.jobId, 5_000))
      );

      const completed = statuses.filter((s) => s.status === 'completed');
      const failed = statuses.filter((s) => s.status === 'failed');
      expect(completed.length).toBeLessThanOrEqual(2);
      expect(completed.length + failed.length).toBe(accepted.length);
    },
    
  );

  it('returns QUEUE_FULL when backlog cap is hit', async () => {
    const modelId = 'flashLite';
    // rpm=1, rpd=1 => maxQueueLength = 1
    await seedModelLimits(redis, modelId, 1, 1);
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });

    const body = { ...createBody('lite'), userId: 'queue-full', role: 'admin' as const };

    const waitingKey = redisKeys.queueWaitingModel(modelId);
    // Fill the counter to the limit so the next INCR exceeds it
    await redis.set(waitingKey, 1);

    const first = await postJob(body);
    expect(first.status).toBe(429);
    expect(first.json.error).toBe('QUEUE_FULL');

    const counter = Number(await redis.get(waitingKey));
    expect(counter).toBe(1);
  });

  it(
    'caps queue by model RPD for admin (second enqueue rejected by model limit)',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 1); // RPD=1 => one job per day
      await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 50 });

      const body = { ...createBody('lite'), userId: 'model-rpd-admin', role: 'admin' as const };

      const first = await postJob(body);
      expect(first.status).toBe(200);

      const second = await postJob(body);
      expect(second.status).toBe(429);
      expect(second.json.error).toBe('MODEL_LIMIT');
    },
    
  );

  it.todo('Add case for QUEUE_FULL status.(Its hard to reproduce in this type of tests)')

  it(
    'throttles user RPD',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 100);

      await redis.hset(redisKeys.userLimits('user-rpd'), {
        role: 'user',
        hard_rpd: 100,
        lite_rpd: 1,
        max_concurrency: 10,
        unlimited: 'false',
      });

      const body = createBody('lite');
      body.userId = 'user-rpd';

      const first = await postJob(body);
      expect(first.status).toBe(200);
      expect(first.json.jobId).toBeTruthy();

      const second = await postJob(body);
      expect(second.status).toBe(429);
      expect(second.json.error).toBe('USER_RPD_LIMIT');
    },
    
  );

  it(
    'throttles user max_concurrency',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 100);

      await redis.hset(redisKeys.userLimits('user-concurrency'), {
        role: 'user',
        hard_rpd: 10,
        lite_rpd: 10,
        max_concurrency: 1,
        unlimited: 'false',
      });

      const body = createBody('lite');
      body.userId = 'user-concurrency';

      const first = await postJob(body);
      expect(first.status).toBe(200);

      const second = await postJob(body);
      expect(second.status).toBe(429);
      expect(second.json.error).toBe('CONCURRENCY_LIMIT');
    },
    
  );

  it(
    'rejects when user RPD was consumed before enqueue',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 100);

      await redis.hset(redisKeys.userLimits('rpd-consumed'), {
        role: 'user',
        hard_rpd: 1,
        lite_rpd: 1,
        max_concurrency: 10,
        unlimited: 'false',
      });

      const body = createBody('lite');
      body.userId = 'rpd-consumed';

      const todayPt = getCurrentDatePT();
      await redis.incr(redisKeys.userTypeRpd(body.userId, 'lite', todayPt));

      const res = await enqueueAndWait(body, redis);
      expect(res.status).toBe(429);
      expect(res.json.error).toBe('USER_RPD_LIMIT');
    },
    
  );

  it(
    'accepts burst even when model RPM is low (worker will throttle)',
    async () => {
      await seedModelLimits(redis, 'flashLite', 100, 10000);
      const body = { ...createBody('lite'), userId: 'burst-admin', role: 'admin' as const };

      const results = await parallelCalls(5, () => postJob(body));
      expect(results.every((r) => r.status === 200)).toBe(true);
    },
    
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
      // QUEUE_FULL is acceptable due to backpressure (~108 for rpm=100, avg=15s)
      const successes = results.filter((r) => r.status === 200);
      expect(successes.length).toBeGreaterThan(90);
      expect(failures.every((f) => f.json.error === 'QUEUE_FULL')).toBe(true);
    },
  );
});
