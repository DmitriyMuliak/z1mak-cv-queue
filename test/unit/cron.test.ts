import { describe, it, expect, beforeEach, vi } from 'vitest';
import { redisKeys } from '../../src/redis/keys';
import { getCurrentDatePT } from '../../src/utils/time';

const { mockRedisInstance } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RedisMock = require('ioredis-mock');
  return { mockRedisInstance: new RedisMock() };
});

vi.mock('../../src/redis/client', () => ({
  createRedisClient: () => mockRedisInstance,
}));

import {
  supabaseQueries,
  supabaseClientMock,
  createdQueues,
  resetDoubles,
  createQueueMock,
} from '../mock/testDoubles';

vi.mock('../../src/db/client', () => ({
  db: supabaseClientMock,
}));

vi.mock('bullmq', () => createQueueMock());

// Import after mocks
import { __test } from '../../src/cron';

describe('cron logic (Behavioral)', () => {
  beforeEach(async () => {
    resetDoubles();
    await mockRedisInstance.flushall();

    // Mock Lua scripts with side effects
    mockRedisInstance.expireStaleJob = vi.fn().mockImplementation(async (keys, args) => {
      const [waitingKey, activeKey, rpdKey, resultKey, metaKey] = keys;
      const [dayTtl, finishedAt, updatedAt, status, error, errorCode, jobId] = args;

      if (waitingKey !== '__nil__') await mockRedisInstance.decr(waitingKey);
      if (activeKey !== '__nil__') await mockRedisInstance.zrem(activeKey, jobId);
      if (rpdKey !== '__nil__') {
        await mockRedisInstance.decr(rpdKey);
        await mockRedisInstance.expire(rpdKey, Number(dayTtl));
      }

      await mockRedisInstance.hset(resultKey, {
        status,
        error,
        error_code: errorCode,
        finished_at: finishedAt,
      });
      await mockRedisInstance.hset(metaKey, {
        status,
        updated_at: updatedAt,
      });

      return 1;
    });

    mockRedisInstance.returnTokensAtomic = vi.fn().mockResolvedValue(1);
  });

  it('syncDbResults scans keys, upserts, and cleans redis', async () => {
    const jobId = 'job-1';
    await mockRedisInstance.hset(redisKeys.jobMeta(jobId), {
      user_id: 'u1',
      requested_model: 'm1',
      created_at: '2023-01-01T00:00:00.000Z',
    });
    await mockRedisInstance.hset(redisKeys.jobResult(jobId), {
      status: 'completed',
      data: JSON.stringify('ok'),
      finished_at: '2023-01-01T00:00:05.000Z',
    });

    await __test.syncDbResults();

    expect(supabaseQueries.length).toBe(1);
    const [sql, params] = supabaseQueries[0];
    expect(sql).toContain('INSERT INTO cv_analyzes');
    expect(params).toHaveLength(12);

    expect(await mockRedisInstance.exists(redisKeys.jobMeta(jobId))).toBe(1);
    expect(await mockRedisInstance.exists(redisKeys.jobResult(jobId))).toBe(1);

    const metaTtl = await mockRedisInstance.ttl(redisKeys.jobMeta(jobId));
    expect(metaTtl).toBeGreaterThan(0);
  });

  it('cleanupOrphanLocks removes only expired locks', async () => {
    const key = redisKeys.userActiveJobs('u1');
    await mockRedisInstance.zadd(key, Date.now() + 100_000, 'keep');
    await mockRedisInstance.zadd(key, Date.now() - 1_000, 'done');

    await __test.cleanupOrphanLocks();

    const remaining = await mockRedisInstance.zrange(key, 0, -1);
    expect(remaining).toContain('keep');
    expect(remaining).not.toContain('done');
  });

  it('expireStaleJobs removes stale jobs, decrements counters and sets RPD TTL', async () => {
    // Initial setup
    const queue = createdQueues[0];
    const staleJob = {
      id: 'j1',
      timestamp: Date.now() - 40 * 60 * 1000,
      data: { userId: 'u1', model: 'm1' },
      remove: vi.fn(),
      getState: vi.fn(async () => 'waiting'),
    };
    queue.getJobs.mockResolvedValue([staleJob]);

    const waitingKey = redisKeys.queueWaitingModel('m1');
    await mockRedisInstance.set(waitingKey, 3);
    const activeKey = redisKeys.userActiveJobs('u1');
    await mockRedisInstance.zadd(activeKey, Date.now(), 'j1');
    const rpdKey = redisKeys.userTypeRpd('u1', 'lite', getCurrentDatePT());
    await mockRedisInstance.set(rpdKey, 5);

    await __test.expireStaleJobs();

    expect(staleJob.remove).toHaveBeenCalled();
    expect(await mockRedisInstance.get(waitingKey)).toBe('2');
    const remainingActive = await mockRedisInstance.zrange(activeKey, 0, -1);
    expect(remainingActive).not.toContain('j1');
    expect(await mockRedisInstance.get(rpdKey)).toBe('4');

    const rpdTtl = await mockRedisInstance.ttl(rpdKey);
    expect(rpdTtl).toBeGreaterThan(0);

    const result = await mockRedisInstance.hgetall(redisKeys.jobResult('j1'));
    expect(result.status).toBe('failed');
    expect(result.error_code).toBe('expired');
  });
});
