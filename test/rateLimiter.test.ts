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
  redisKeys,
  RunBody,
} from './utils/rateTestUtils';

const enqueueAndWait = async (body: RunBody, redis: Redis) => {
  const res = await postJob(body);
  if (res.status === 200) {
    await waitForProcessedModel(redis, res.json.jobId);
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
    'throttles model by RPM',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 10, 100);

      const body = { ...createBody('lite'), userId: 'rpm-admin', role: 'admin' as const };

      for (let i = 0; i < 10; i++) {
        const call = await postJob(body);
        expect(call.status).toBe(200);
        expect(call.json.jobId).toBeTruthy();
      }

      const last = await postJob(body);
      expect(last.status).toBe(429);
      expect(last.json.error).toBe('MODEL_LIMIT');
    },
    30_000
  );

  it(
    'throttles model by RPD',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 1);

      const body = { ...createBody('lite'), userId: 'model-rpd', role: 'admin' as const };

      const first = await postJob(body);
      expect(first.status).toBe(200);
      expect(first.json.jobId).toBeTruthy();

      const second = await postJob(body);
      expect(second.status).toBe(429);
      expect(second.json.error).toBe('MODEL_LIMIT');
    },
    30_000
  );

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
    'falls back to the next model when primary RPM is exhausted',
    async () => {
      await seedModelLimits(redis, 'flashLite', 1, 10);
      await seedModelLimits(redis, 'flashLitePreview', 10, 10);
      await seedModelLimits(redis, 'flashPreview', 10, 10);

      const body = { ...createBody('lite'), userId: 'fallback-lite', role: 'admin' as const };

      const first = await enqueueAndWait(body, redis);
      expect(first.status).toBe(200);
      const firstModel = await waitForProcessedModel(redis, first.json.jobId);
      expect(firstModel).toBe('flashLite');

      const second = await enqueueAndWait(body, redis);
      expect(second.status).toBe(200);
      const secondModel = await waitForProcessedModel(redis, second.json.jobId);
      expect(secondModel).toBe('flashLitePreview');
    },
    30_000
  );

  it(
    'skips models without configured limits and uses fallback with limits',
    async () => {
      // flashLite has no limits stored, so it should try flashLitePreview next.
      await seedModelLimits(redis, 'flashLitePreview', 5, 5);

      const body = { ...createBody('lite'), userId: 'missing-limits', role: 'admin' as const };

      const res = await enqueueAndWait(body, redis);
      expect(res.status).toBe(200);
      const usedModel = await waitForProcessedModel(redis, res.json.jobId);
      expect(usedModel).toBe('flashLitePreview');
    },
    30_000
  );

  it(
    'returns MODEL_LIMIT when the entire hard chain is exhausted',
    async () => {
      // hard chain: pro2dot5 -> flash -> flashPreview
      await seedModelLimits(redis, 'pro2dot5', 1, 10);
      await seedModelLimits(redis, 'flash', 1, 10);
      // flashPreview intentionally has no limits -> final exhaust

      const body = { ...createBody('hard'), userId: 'hard-chain', role: 'admin' as const };

      const first = await enqueueAndWait(body, redis);
      expect(first.status).toBe(200);
      const firstModel = await waitForProcessedModel(redis, first.json.jobId);
      expect(firstModel).toBe('pro2dot5');

      const second = await enqueueAndWait(body, redis);
      expect(second.status).toBe(200);
      const secondModel = await waitForProcessedModel(redis, second.json.jobId);
      expect(secondModel).toBe('flash');

      const third = await postJob(body);
      expect(third.status).toBe(429);
      expect(third.json.error).toBe('MODEL_LIMIT');
    },
    30_000
  );

  it(
    'applies default user limits when no user record exists',
    async () => {
      const modelId = 'flashLite';
      await seedModelLimits(redis, modelId, 100, 100);

      const body = { ...createBody('lite'), userId: 'no-cache-user', role: 'user' as const };

      // default lite_rpd is 9, so 9 passes then 10th fails
      for (let i = 0; i < 9; i++) {
        const call = await enqueueAndWait(body, redis);
        expect(call.status).toBe(200);
      }

      const last = await postJob(body);
      expect(last.status).toBe(429);
      expect(last.json.error).toBe('USER_RPD_LIMIT');
    },
    30_000
  );
});
