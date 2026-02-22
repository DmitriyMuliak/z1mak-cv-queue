import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import {
  createBody,
  createRedis,
  configureMockGemini,
  seedModelLimits,
  waitForApi,
  startCompose,
  stopCompose,
  redisKeys,
} from '../utils/rateTestUtils';
import { IntegrationTestClient } from '../helpers/IntegrationTestClient';
import { AVG_SECONDS, computeMaxQueueLength } from '../../src/routes/resume/queueUtils';

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

describe('Rate limiter (model RPM/RPD) (Behavioral)', () => {
  let redis: Redis;
  let client: IntegrationTestClient;

  beforeAll(async () => {
    await startCompose();
    redis = createRedis();
    client = new IntegrationTestClient();
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });
    await waitForApi();
  }, 60_000);

  afterAll(async () => {
    await redis?.quit();
    await stopCompose();
  }, 60_000);

  beforeEach(async () => {
    await redis.flushall();
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });
  });

  it('caps queue by model RPD when RPD=1 (second enqueue rejected)', async () => {
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

    const first = await client.submitJob(body);
    expect(first.status).toBe(200);
    const firstResult = await client.waitForResult(redis, first.json.jobId, 30_000);
    expect(firstResult.status).toBe('completed');

    const second = await client.submitJob(body);
    expect(second.status).toBe(429);
    expect(second.json.error).toBe('USER_RPD_LIMIT:lite');
  });

  it('allows small bursts when model rpm is 50', async () => {
    const modelId = 'flashLite';
    await seedModelLimits(redis, modelId, 50, 100);
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });

    const body = { ...createBody('lite'), userId: 'rpm-burst', role: 'admin' as const };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => client.submitJob(body))
    );
    expect(results.every((r) => r.status === 200)).toBe(true);

    const metas = await Promise.all(
      results.map((r) => client.waitForResult(redis, r.json.jobId, 5_000))
    );
    expect(metas.every((m) => m.status === 'completed')).toBe(true);
  });

  it('limits daily capacity when backlog exceeds dynamic limit', async () => {
    const modelId = 'flashLite';
    await seedModelLimits(redis, modelId, 50, 2); // 2 jobs per day
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });

    const body = {
      ...createBody('lite'),
      userId: 'queue-backlog',
      role: 'admin' as const,
    };

    const results = await Promise.all(
      Array.from({ length: 4 }, () => client.submitJob(body))
    );

    const accepted = results.filter((r) => r.status === 200);
    const rejected = results.filter((r) => r.status === 429);
    expect(accepted.length).toBeGreaterThan(0);
    expect(rejected.length).toBeGreaterThan(0);
    expect(
      rejected.every((r) => ['MODEL_LIMIT', 'QUEUE_FULL'].includes(r.json.error))
    ).toBe(true);

    const statuses = await Promise.all(
      accepted.map((r) => client.waitForResult(redis, r.json.jobId, 5_000))
    );

    const completed = statuses.filter((s) => s.status === 'completed');
    const failed = statuses.filter((s) => s.status === 'failed');
    expect(completed.length).toBeLessThanOrEqual(2);
    expect(completed.length + failed.length).toBe(accepted.length);
  });

  it('returns QUEUE_FULL when backlog cap is hit', async () => {
    const modelId = 'flashLite';
    await seedModelLimits(redis, modelId, 1, 1);
    await configureMockGemini({ mode: 'success', text: 'ok', status: 200, delayMs: 0 });

    const body = { ...createBody('lite'), userId: 'queue-full', role: 'admin' as const };

    const waitingKey = redisKeys.queueWaitingModel(modelId);
    await redis.set(waitingKey, 1);

    const first = await client.submitJob(body);
    expect(first.status).toBe(429);
    expect(first.json.error).toBe('QUEUE_FULL');

    const counter = Number(await redis.get(waitingKey));
    expect(counter).toBe(1);
  });

  it('throttles user RPD', async () => {
    const modelId = 'flashLite';
    await seedModelLimits(redis, modelId, 100, 100);

    await redis.hset(redisKeys.userLimits('user-rpd'), {
      role: 'user',
      hard_rpd: 100,
      lite_rpd: 1,
      max_concurrency: 10,
      unlimited: 'false',
    });

    const body = { ...createBody('lite'), userId: 'user-rpd', role: 'user' as const };

    const first = await client.submitJob(body);
    expect(first.status).toBe(200);
    expect(first.json.jobId).toBeTruthy();

    const second = await client.submitJob(body);
    expect(second.status).toBe(429);
    expect(second.json.error).toBe('USER_RPD_LIMIT:lite');
  });

  it('throttles user max_concurrency', async () => {
    const modelId = 'flashLite';
    await seedModelLimits(redis, modelId, 100, 100);

    await redis.hset(redisKeys.userLimits('user-concurrency'), {
      role: 'user',
      hard_rpd: 10,
      lite_rpd: 10,
      max_concurrency: 1,
      unlimited: 'false',
    });

    const body = {
      ...createBody('lite'),
      userId: 'user-concurrency',
      role: 'user' as const,
    };

    const first = await client.submitJob(body);
    expect(first.status).toBe(200);

    const second = await client.submitJob(body);
    expect(second.status).toBe(429);
    expect(second.json.error).toBe('CONCURRENCY_LIMIT');
  });

  it('enforces user RPD with many parallel calls', async () => {
    await seedModelLimits(redis, 'flashLite', 10_000, 10_000); // high model limits
    await redis.hset(redisKeys.userLimits('burst-user'), {
      role: 'user',
      hard_rpd: 5,
      lite_rpd: 5,
      max_concurrency: 50,
      unlimited: 'false',
    });

    const body = { ...createBody('lite'), userId: 'burst-user', role: 'user' as const };

    const results = await parallelCalls(20, () => client.submitJob(body));
    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 429);

    expect(successes.length).toBe(5);
    expect(failures.length).toBe(15);
    expect(failures.every((r) => r.json.error === 'USER_RPD_LIMIT:lite')).toBe(true);
  });

  it('backpressures with QUEUE_FULL when rpm is low and provider is slow', async () => {
    const modelId = 'flashLite';
    const maxQueueLength = computeMaxQueueLength(1, 10_000, AVG_SECONDS.lite);
    const requestsAmount = 60;
    const failureRequestsLength = requestsAmount - maxQueueLength;
    const successRequestsLength = requestsAmount - failureRequestsLength;

    await seedModelLimits(redis, modelId, 1, 10_000);

    await configureMockGemini({
      mode: 'success',
      text: 'ok',
      status: 200,
      delayMs: 1000,
    });

    const results = await runInBatches(requestsAmount, requestsAmount, (i) =>
      client.submitJob({
        ...createBody('lite'),
        userId: `queue-full-burst-${i}`,
        role: 'admin',
      })
    );

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 429);

    expect(successes.length).toBe(successRequestsLength);
    expect(failures.length).toBe(failureRequestsLength);

    expect(failures.every((f) => f.json.error === 'QUEUE_FULL')).toBe(true);
  });
});
