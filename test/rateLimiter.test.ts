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
} from './utils/rateTestUtils';

const enqueueAndWait = async (body: RunBody, redis: Redis, timeoutMs = 10_000) => {
  const res = await postJob(body);
  if (res.status === 200) {
    await waitForProcessedModel(redis, res.json.jobId, timeoutMs);
  }
  return res;
};

describe('Rate limiter (model RPM/RPD)', () => {
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
    30_000
  );

  it(
    'limits daily capacity when backlog exceeds dynamic limit',
    async () => {
      const modelId = 'flashLite';
      // RPM > RPD - skip check by rpm
      await seedModelLimits(redis, modelId, 50, 2); // 2 задачі на день
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
    30_000
  );

  it('returns QUEUE_FULL when backlog cap is hit', async () => {
    const modelId = 'flashLite';
    // rpm=1, rpd=1 => maxQueueLength = 1
    await seedModelLimits(redis, modelId, 1, 1);
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });

    const body = { ...createBody('lite'), userId: 'queue-full', role: 'admin' as const };

    const waitingKey = redisKeys.queueWaitingModel(modelId);
    // Заповнюємо лічильник до межі, щоб наступний INCR перевищив ліміт
    await redis.set(waitingKey, 1);

    const first = await postJob(body);
    // const second = await postJob(body);

    // expect(first.status).toBe(200);
    expect(first.status).toBe(429);
    expect(first.json.error).toBe('QUEUE_FULL');
  });

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
    30_000
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
    30_000
  );

  it(
    'throttles user hard_rpd',
    async () => {
      const modelId = 'pro2dot5'; // treated as hard in pickRpdLimit
      await seedModelLimits(redis, modelId, 100, 100);

      await redis.hset(redisKeys.userLimits('user-hard'), {
        role: 'user',
        hard_rpd: 1,
        lite_rpd: 5,
        max_concurrency: 2,
        unlimited: 'false',
      });

      const body = createBody('hard');
      body.userId = 'user-hard';

      const first = await postJob(body);
      expect(first.status).toBe(200);

      const second = await postJob(body);
      expect(second.status).toBe(429);
      expect(second.json.error).toBe('USER_RPD_LIMIT');
    },
    30_000
  );

  it(
    'throttles user lite_rpd',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 100);

      await redis.hset(redisKeys.userLimits('user-lite'), {
        role: 'user',
        hard_rpd: 5,
        lite_rpd: 1,
        max_concurrency: 2,
        unlimited: 'false',
      });

      const body = createBody('lite');
      body.userId = 'user-lite';

      const first = await postJob(body);
      expect(first.status).toBe(200);

      const second = await postJob(body);
      expect(second.status).toBe(429);
      expect(second.json.error).toBe('USER_RPD_LIMIT');
    },
    30_000
  );

  it(
    'admin bypasses user RPM/RPD/concurrency',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 100);

      await redis.hset(redisKeys.userLimits('admin-1'), {
        role: 'admin',
        hard_rpd: 1,
        lite_rpd: 1,
        max_concurrency: 2,
        unlimited: 'true',
      });

      const body = { ...createBody('lite'), userId: 'admin-1', role: 'admin' as const };

      const first = await postJob(body);
      expect(first.status).toBe(200);

      const second = await postJob(body);
      expect(second.status).toBe(200);
    },
    30_000
  );

  it(
    'skips models without configured limits and uses fallback with limits',
    async () => {
      await seedModelLimits(redis, 'flashLitePreview', 5, 5);

      const body = { ...createBody('lite'), userId: 'missing-limits', role: 'admin' as const };

      const res = await enqueueAndWait(body, redis);
      expect(res.status).toBe(200);
      const usedModel = await waitForProcessedModel(redis, res.json.jobId, 20_000);
      expect(usedModel).toBe('flashLitePreview');
    },
    30_000
  );

  it(
    'applies default user limits when no user record exists',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 100);

      const body = { ...createBody('lite'), userId: 'no-cache-user', role: 'user' as const };

      // default lite_rpd is 9, so перші виклики можуть упиратись у backpressure/модельні ліміти
      let successes = 0;
      for (let i = 0; i < 10; i++) {
        const call = await enqueueAndWait(body, redis);
        if (call.status === 200) successes++;
      }
      console.log('successes', successes)
      expect(successes).toBeGreaterThan(0);
    },
    30_000
  );
});
