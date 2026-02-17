import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { Client } from 'pg';
import {
  createBody,
  createRedis,
  configureMockGemini,
  seedModelLimits,
  seedModelLimitsFull,
  waitForApi,
  startCompose,
  stopCompose,
  waitForJobResult,
  waitForProcessedModel,
  postStreamJob,
  ndjsonToArray,
  TEST_DB_PORT,
} from '../utils/rateTestUtils';

describe('Streaming, Fallback and DB Persistence Integration', () => {
  let redis: Redis;
  let pgClient: Client;

  beforeAll(async () => {
    await startCompose();
    redis = createRedis();

    pgClient = new Client({
      connectionString: `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres`,
    });
    await pgClient.connect();

    await waitForApi();
  }, 180_000);

  afterAll(async () => {
    await pgClient?.end();
    await redis?.quit();
    await stopCompose();
  }, 120_000);

  beforeEach(async () => {
    await redis.flushall();
    await pgClient.query('DELETE FROM cv_analyzes');
    await configureMockGemini({
      mode: 'success',
      text: '{"result": "ok"}',
      status: 200,
      delayMs: 0,
    });
  });

  it('completes full streaming cycle and persists data to PostgreSQL', async () => {
    const modelId = 'flashLite';
    await seedModelLimits(redis, modelId, 100, 100);

    const body = { ...createBody('lite'), userId: 'stream-user', role: 'user' as const };
    const expectedText = '{"summary": "excellent candidate"}';
    await configureMockGemini({
      mode: 'success',
      text: expectedText,
      status: 200,
      delayMs: 10,
    });

    const response = await postStreamJob(body);
    expect(response.status).toBe(200);

    const jobId = response.headers.get('x-job-id');
    expect(jobId).toBeTruthy();

    // 1. Verify Streaming
    const chunks = await ndjsonToArray(response);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.type === 'done')).toBe(true);

    // 2. Verify Redis Result
    const result = await waitForJobResult(redis, jobId!, 30_000);
    expect(result.status).toBe('completed');
  }, 60_000);

  it('falls back to secondary model when primary RPD is exceeded', async () => {
    await seedModelLimitsFull(redis, 'flash', 100, 100, 'lite', 1);
    await seedModelLimitsFull(redis, 'flashLite', 100, 1, 'lite', 2);

    const body = {
      ...createBody('lite'),
      userId: 'fallback-user',
      role: 'admin' as const,
    };

    const first = await postStreamJob(body);
    const firstJobId = first.headers.get('x-job-id');
    const firstUsed = await waitForProcessedModel(redis, firstJobId!, 10_000);
    expect(firstUsed).toBe('flashLite');

    const second = await postStreamJob(body);
    const secondJobId = second.headers.get('x-job-id');
    const secondResult = await waitForJobResult(redis, secondJobId!, 10_000);

    expect(secondResult.status).toBe('completed');
    expect(secondResult.used_model).toBe('flash');
  }, 40_000);
});
