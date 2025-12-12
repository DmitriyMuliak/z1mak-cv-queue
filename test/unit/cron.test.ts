import { describe, it, expect, beforeEach, vi } from 'vitest';
import { redisKeys } from '../../src/redis/keys';
import { getCurrentDatePT } from '../../src/utils/time';

vi.mock('../../src/redis/client', () => ({
  createRedisClient: () => fakeRedis,
}));

vi.mock('../../src/db/client', () => ({
  supabaseClient: supabaseClientMock,
}));

vi.mock('bullmq', () => {
  const Queue = vi.fn().mockImplementation(() => {
    const queue = {
      getJobs: vi.fn(async () => []),
      close: vi.fn(),
    };
    createdQueues.push(queue);
    return queue;
  });
  return { Queue };
});

// Import after mocks
import { __test } from '../../src/cron';

describe('cron logic', () => {
  beforeEach(() => {
    fakeRedis.strings.clear();
    fakeRedis.hashes.clear();
    fakeRedis.zsets.clear();
    fakeRedis.expirations.clear();
    fakeRedis.scanCalls = [];
    fakeRedis.delCalls = [];
    supabaseQueries.length = 0;
    createdQueues.forEach((q) => {
      q.getJobs = vi.fn(async () => []);
      q.close = vi.fn();
    });
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
    expect(fakeRedis.hashes.has(redisKeys.jobMeta(jobId))).toBe(false);
    expect(fakeRedis.hashes.has(redisKeys.jobResult(jobId))).toBe(false);
  });

  it('cleanupOrphanLocks removes only jobs with existing results', async () => {
    const key = redisKeys.userActiveJobs('u1');
    fakeRedis.zadd(key, Date.now(), 'keep');
    fakeRedis.zadd(key, Date.now(), 'done');
    fakeRedis.hset(redisKeys.jobResult('done'), { status: 'completed' });

    await __test.cleanupOrphanLocks();

    const remaining = fakeRedis.zrange(key, 0, -1);
    expect(remaining).toContain('keep');
    expect(remaining).not.toContain('done');
  });

  it('expireStaleJobs removes stale jobs, decrements counters and sets RPD TTL', async () => {
    // ensure queues exist
    await __test.expireStaleJobs();
    const queue = createdQueues[0];
    const staleJob = {
      id: 'j1',
      timestamp: Date.now() - 40 * 60 * 1000,
      data: { userId: 'u1', model: 'm1' },
      remove: vi.fn(),
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

// Помилки моків у cron-тестах були через хойстинг: Vitest піднімає vi.mock нагору файлу, 
// і використовувані в моках змінні мають бути ініціалізовані до цього. 
// Переписав тест із vi.hoisted, який створює всі моки 
// (fakeRedis, supabaseClientMock, масиви) ще до хойстнутого vi.mock. 
const { fakeRedis, supabaseQueries, supabaseClientMock, createdQueues } = vi.hoisted(() => {
  const endsWithSafe = (key: string, suffix: string | undefined) =>
    suffix ? key.endsWith(suffix) : true;

  class FakeRedis {
    strings = new Map<string, string>();
    hashes = new Map<string, Record<string, string>>();
    zsets = new Map<string, Set<string>>();
    expirations = new Map<string, number>();

    scanCalls: Array<{ pattern: string; count: number }> = [];
    delCalls: string[][] = [];

    set(key: string, value: string | number) {
      this.strings.set(key, String(value));
    }

    get(key: string) {
      return this.strings.get(key) ?? null;
    }

    hset(key: string, values: Record<string, string | number | null | undefined>) {
      const existing = this.hashes.get(key) ?? {};
      for (const [k, v] of Object.entries(values)) {
        existing[k] = v === undefined || v === null ? '' : String(v);
      }
      this.hashes.set(key, existing);
    }

    hgetall(key: string) {
      return this.hashes.get(key) ?? {};
    }

    del(...keys: string[]) {
      this.delCalls.push(keys);
      for (const key of keys) {
        this.strings.delete(key);
        this.hashes.delete(key);
        this.zsets.delete(key);
      }
    }

    exists(key: string) {
      return this.strings.has(key) || this.hashes.has(key) || this.zsets.has(key) ? 1 : 0;
    }

    scan(cursor: string, _match: string, pattern: string, _countKey: string, count: number) {
      this.scanCalls.push({ pattern, count });
      const keys = Array.from(
        new Set([...this.strings.keys(), ...this.hashes.keys(), ...this.zsets.keys()])
      ).filter((k) => this.matchesPattern(k, pattern));
      const slice = keys.slice(Number(cursor), Number(cursor) + count);
      const next = Number(cursor) + count >= keys.length ? '0' : String(Number(cursor) + count);
      return [next, slice];
    }

    private matchesPattern(key: string, pattern: string) {
      if (pattern === '*') return true;
      const [prefix, suffix] = pattern.split('*');
      return key.startsWith(prefix) && endsWithSafe(key, suffix);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    zrange(key: string, _start: number, _end: number) {
      return Array.from(this.zsets.get(key) ?? []);
    }

    zrem(key: string, member: string) {
      const set = this.zsets.get(key);
      if (!set) return 0;
      const had = set.delete(member);
      return had ? 1 : 0;
    }

    zadd(key: string, _score: number, member: string) {
      const set = this.zsets.get(key) ?? new Set<string>();
      set.add(member);
      this.zsets.set(key, set);
    }

    incr(key: string) {
      const next = Number(this.strings.get(key) ?? 0) + 1;
      this.strings.set(key, String(next));
      return next;
    }

    decr(key: string) {
      const next = Number(this.strings.get(key) ?? 0) - 1;
      this.strings.set(key, String(next));
      return next;
    }

    pipeline() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      const ops: Array<[null, any]> = []; // first item is error
      const chain = {
        hset(key: string, values: Record<string, string | number | null | undefined>) {
          self.hset(key, values);
          ops.push([null, 'OK']);
          return chain;
        },
        exists(key: string) {
          const exists = self.exists(key);
          ops.push([null, exists]);
          return chain;
        },
        decr(key: string) {
          const val = self.decr(key);
          ops.push([null, val]);
          return chain;
        },
        zrem(key: string, member: string) {
          const res = self.zrem(key, member);
          ops.push([null, res]);
          return chain;
        },
        expire(key: string, ttl: number) {
          self.expire(key, ttl);
          ops.push([null, 1]);
          return chain;
        },
        exec: async () => ops,
      };
      return chain;
    }

    expire(key: string, ttl: number) {
      this.expirations.set(key, ttl);
    }
  }

  const fakeRedis = new FakeRedis();

  const supabaseQueries: any[] = [];
  const supabaseClientMock = {
    isMock: false,
    query: async (sql: string, params: unknown[] = []) => {
      supabaseQueries.push([sql, params]);
      return { rows: [] };
    },
    connect: async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        supabaseQueries.push([sql, params]);
        return { rows: [] };
      },
      release: async () => {},
    }),
    end: async () => {},
  };

  const createdQueues: any[] = [];

  return { fakeRedis, supabaseQueries, supabaseClientMock, createdQueues };
});
