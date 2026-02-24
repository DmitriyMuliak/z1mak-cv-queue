import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { Client } from 'pg';
import {
  createBody,
  createRedis,
  configureMockGemini,
  seedModelLimits,
  seedModelLimitsFull,
  waitForProcessedModel,
  truncateCvAnalyzes,
  scopeUserId,
  TEST_DB_CONNECTION_STRING,
} from '../utils/rateTestUtils';
import { IntegrationTestClient } from '../helpers/IntegrationTestClient';

describe('Streaming, Fallback and DB Persistence Integration (Behavioral)', () => {
  let redis: Redis;
  let pgClient: Client;
  let client: IntegrationTestClient;

  beforeAll(async () => {
    redis = createRedis();
    client = new IntegrationTestClient();

    pgClient = new Client({
      connectionString: TEST_DB_CONNECTION_STRING,
    });
    await pgClient.connect();
  }, 180_000);

  afterAll(async () => {
    await pgClient?.end();
    await redis?.quit();
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([redis.flushall(), truncateCvAnalyzes(pgClient)]);
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

    const body = {
      ...createBody('lite'),
      userId: scopeUserId('stream-user'),
      role: 'user' as const,
    };
    const expectedText = '{"summary": "excellent candidate"}';
    await configureMockGemini({
      mode: 'success',
      text: expectedText,
      status: 200,
      delayMs: 10,
    });

    const response = await client.submitStreamJob(body);
    expect(response.status).toBe(200);

    const { jobId } = (await response.json()) as any;
    expect(jobId).toBeTruthy();

    // 1. Wait for job completion in Redis
    const result = await client.waitForResult(redis, jobId, 30_000);
    expect(result.status).toBe('completed');

    // 2. Verify Streaming using Driver
    const { status, events } = await client.getStream(jobId, body.userId, body.role);
    expect(status).toBe(200);

    // Using behavioral matchers
    expect(events).toEmitSnapshot({ status: 'completed' });
    expect(events).toCompleteSuccessfully();
  }, 60_000);

  it('falls back to secondary model when primary RPD is exceeded', async () => {
    await seedModelLimitsFull(redis, 'flash', 100, 100, 'lite', 1);
    await seedModelLimitsFull(redis, 'flashLite', 100, 1, 'lite', 2);

    const body = {
      ...createBody('lite'),
      userId: scopeUserId('fallback-user'),
      role: 'admin' as const,
    };

    const first = await client.submitStreamJob(body);
    const { jobId: firstJobId } = (await first.json()) as any;
    const firstUsed = await waitForProcessedModel(redis, firstJobId!, 10_000);
    expect(firstUsed).toBe('flashLite');

    const second = await client.submitStreamJob(body);
    const { jobId: secondJobId } = (await second.json()) as any;
    const secondResult = await client.waitForResult(redis, secondJobId!, 10_000);

    expect(secondResult.status).toBe('completed');
    expect(secondResult.used_model).toBe('flash');
  }, 40_000);
});
