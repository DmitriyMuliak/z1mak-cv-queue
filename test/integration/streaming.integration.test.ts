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
  connectToStream,
  sseToArray,
  requestApi,
  INTERNAL_KEY,
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

    const { jobId } = (await response.json()) as Record<string, string>;
    expect(jobId).toBeTruthy();

    // Wait for job to leave 'queued' state so we don't get immediate Adaptive Polling closure
    let ready = false;
    for (let i = 0; i < 3; i++) {
      const { status, json } = await requestApi(
        `/resume/${jobId}/status`,
        'GET',
        undefined,
        {
          'x-internal-api-key': INTERNAL_KEY,
        }
      );
      if (status === 200 && json.status !== 'queued') {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(ready).toBe(true);

    // 1. Verify Streaming
    const streamRes = await connectToStream(jobId, body.userId, body.role);
    expect(streamRes.status).toBe(200);

    const events = await sseToArray(streamRes);
    expect(
      events.length,
      `Stream must contain events. Received: ${JSON.stringify(events)}`
    ).toBeGreaterThan(0);

    // 1. Must contain a snapshot event with 'completed' status (either from history or DB)
    const snapshot = events.find((e) => e.event === 'snapshot');
    expect(snapshot, 'Stream must contain a snapshot event').toBeDefined();
    expect(
      snapshot?.data.status,
      `Snapshot status should be 'completed'. Data: ${JSON.stringify(snapshot?.data)}`
    ).toBe('completed');

    // 2. The very last event MUST be 'done'
    const lastEvent = events[events.length - 1];
    expect(lastEvent.event).toBe('done');

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
    const { jobId: firstJobId } = (await first.json()) as any;
    const firstUsed = await waitForProcessedModel(redis, firstJobId!, 10_000);
    expect(firstUsed).toBe('flashLite');

    const second = await postStreamJob(body);
    const { jobId: secondJobId } = (await second.json()) as any;
    const secondResult = await waitForJobResult(redis, secondJobId!, 10_000);

    expect(secondResult.status).toBe('completed');
    expect(secondResult.used_model).toBe('flash');
  }, 40_000);
});
