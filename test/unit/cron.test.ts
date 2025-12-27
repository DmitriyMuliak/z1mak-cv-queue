import { describe, it, expect, beforeEach, vi } from 'vitest';
import { redisKeys } from '../../src/redis/keys';
import { getCurrentDatePT } from '../../src/utils/time';

import {
  fakeRedis,
  supabaseQueries,
  supabaseClientMock,
  createdQueues,
  resetDoubles,
  createQueueMock,
} from '../mock/testDoubles';

vi.mock('../../src/redis/client', () => ({
  createRedisClient: () => fakeRedis,
}));

vi.mock('../../src/db/client', () => ({
  db: supabaseClientMock,
}));

vi.mock('bullmq', () => createQueueMock());

// Import after mocks
import { __test } from '../../src/cron';

describe('cron logic', () => {
  beforeEach(() => {
    resetDoubles();
  });

  it('syncDbResults scans keys, upserts, and cleans redis', async () => {
    const jobId = 'job-1';
    fakeRedis.hset(redisKeys.jobMeta(jobId), {
      user_id: 'u1',
      requested_model: 'm1',
      created_at: '2023-01-01T00:00:00.000Z',
    });
    fakeRedis.hset(redisKeys.jobResult(jobId), {
      status: 'completed',
      data: JSON.stringify('ok'),
      finished_at: '2023-01-01T00:00:05.000Z',
    });

    await __test.syncDbResults();

    expect(supabaseQueries.length).toBe(1);
    const [sql, params] = supabaseQueries[0];
    expect(sql).toContain('INSERT INTO job');
    expect(params).toHaveLength(12);
    expect(fakeRedis.hashes.has(redisKeys.jobMeta(jobId))).toBe(true);
    expect(fakeRedis.hashes.has(redisKeys.jobResult(jobId))).toBe(true);
    expect(fakeRedis.ttl(redisKeys.jobMeta(jobId))).toBe(300);
    expect(fakeRedis.ttl(redisKeys.jobResult(jobId))).toBe(300);
  });

  it('cleanupOrphanLocks removes only expired locks', async () => {
    const key = redisKeys.userActiveJobs('u1');
    fakeRedis.zadd(key, Date.now() + 100_000, 'keep');
    fakeRedis.zadd(key, Date.now() - 1_000, 'done');

    await __test.cleanupOrphanLocks();

    const remaining = fakeRedis.zrange(key, 0, -1);
    expect(remaining).toContain('keep');
    expect(remaining).not.toContain('done');
  });

  it('expireStaleJobs removes stale jobs, decrements counters and sets RPD TTL', async () => {
    await __test.expireStaleJobs();
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
    fakeRedis.set(waitingKey, 3);
    const activeKey = redisKeys.userActiveJobs('u1');
    fakeRedis.zadd(activeKey, Date.now(), 'j1');
    const rpdKey = redisKeys.userTypeRpd('u1', 'lite', getCurrentDatePT());
    fakeRedis.set(rpdKey, 5);

    await __test.expireStaleJobs();

    expect(staleJob.remove).toHaveBeenCalled();
    expect(fakeRedis.get(waitingKey)).toBe('2');
    expect(fakeRedis.zrange(activeKey, 0, -1)).not.toContain('j1');
    expect(fakeRedis.get(rpdKey)).toBe('4');
    expect(fakeRedis.expirations.has(rpdKey)).toBe(true);
    const result = fakeRedis.hgetall(redisKeys.jobResult('j1'));
    expect(result.status).toBe('failed');
    expect(result.error_code).toBe('expired');
  });
});
