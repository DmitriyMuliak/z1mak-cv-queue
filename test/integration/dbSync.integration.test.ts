import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { Client } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  createBody,
  createRedis,
  configureMockGemini,
  seedModelLimits,
  waitForApi,
  startCompose,
  stopCompose,
  waitForJobResult,
  postStreamJob,
  TEST_DB_PORT,
} from '../utils/rateTestUtils';

describe('Database Synchronization Cron Job', () => {
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

  it('automatically persists completed job result to PostgreSQL via cron', async () => {
    const modelId = 'flashLite';
    await seedModelLimits(redis, modelId, 100, 100);

    const body = { ...createBody('lite'), userId: uuidv4(), role: 'user' as const };
    const expectedText = '{"summary": "synced via cron"}';
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

    // 1. Verify Redis Result
    const result = await waitForJobResult(redis, jobId!, 30_000);
    expect(result.status).toBe('completed');

    // 2. Verify DB Persistence (wait for DB sync cron)
    let dbRow = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 10_000) {
      const dbRes = await pgClient.query('SELECT * FROM cv_analyzes WHERE id = $1', [
        jobId,
      ]);
      if (dbRes.rows.length > 0) {
        dbRow = dbRes.rows[0];
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(dbRow, 'Job should be persisted to PostgreSQL by cron').toBeTruthy();
    expect(dbRow.status).toBe('completed');
    expect(JSON.stringify(dbRow.result)).toContain('synced via cron');
  }, 60_000);
});
