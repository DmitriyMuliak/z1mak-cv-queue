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
    // ensure queues exist
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

// Mock issues in cron tests were due to hoisting: Vitest lifts vi.mock to the top of the file,
// so variables used in mocks must be initialized earlier.
// Rewrote the test with vi.hoisted to create all mocks
// (fakeRedis, supabaseClientMock, arrays) before the hoisted vi.mock.
const { fakeRedis, supabaseQueries, supabaseClientMock, createdQueues } = vi.hoisted(
  () => {
    const endsWithSafe = (key: string, suffix: string | undefined) =>
      suffix ? key.endsWith(suffix) : true;

    class FakeRedis {
      strings = new Map<string, string>();
      hashes = new Map<string, Record<string, string>>();
      zsets = new Map<string, Map<string, number>>();
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
        return this.strings.has(key) || this.hashes.has(key) || this.zsets.has(key)
          ? 1
          : 0;
      }

      scan(
        cursor: string,
        _match: string,
        pattern: string,
        _countKey: string,
        count: number
      ) {
        this.scanCalls.push({ pattern, count });
        const keys = Array.from(
          new Set([...this.strings.keys(), ...this.hashes.keys(), ...this.zsets.keys()])
        ).filter((k) => this.matchesPattern(k, pattern));
        const slice = keys.slice(Number(cursor), Number(cursor) + count);
        const next =
          Number(cursor) + count >= keys.length ? '0' : String(Number(cursor) + count);
        return [next, slice];
      }

      private matchesPattern(key: string, pattern: string) {
        if (pattern === '*') return true;
        const [prefix, suffix] = pattern.split('*');
        return key.startsWith(prefix) && endsWithSafe(key, suffix);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      zrange(key: string, _start: number, _end: number) {
        const map = this.zsets.get(key);
        if (!map) return [];
        return Array.from(map.entries())
          .sort((a, b) => a[1] - b[1])
          .map(([member]) => member);
      }

      zrem(key: string, member: string) {
        const map = this.zsets.get(key);
        if (!map) return 0;
        const had = map.delete(member);
        return had ? 1 : 0;
      }

      zadd(key: string, score: number, member: string) {
        const map = this.zsets.get(key) ?? new Map<string, number>();
        map.set(member, score);
        this.zsets.set(key, map);
      }

      zremrangebyscore(key: string, min: number | string, max: number | string) {
        const map = this.zsets.get(key);
        if (!map) return 0;
        const minNum = min === '-inf' ? Number.NEGATIVE_INFINITY : Number(min);
        const maxNum = max === '+inf' ? Number.POSITIVE_INFINITY : Number(max);
        let removed = 0;
        for (const [member, score] of Array.from(map.entries())) {
          if (score >= minNum && score <= maxNum) {
            map.delete(member);
            removed++;
          }
        }
        return removed;
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

      returnTokensAtomic(
        keys: [string, string, string],
        args: [number, number, number, number]
      ) {
        const [rpmKey, rpdKey, userKey] = keys;
        const [consume, minuteTtl, dayTtl, userTtl] = args;
        const decrClamp = (key: string, ttl: number) => {
          if (!key || key === '__nil__') return;
          const val = Number(this.strings.get(key) ?? 0) - consume;
          const next = val < 0 ? 0 : val;
          this.set(key, next);
          if (ttl > 0) this.expire(key, ttl);
        };
        decrClamp(rpmKey, minuteTtl);
        decrClamp(rpdKey, dayTtl);
        decrClamp(userKey, userTtl);
      }

      expireStaleJob(
        keys: [string, string, string, string, string],
        args: [number, string, string, string, string, string, string]
      ) {
        const [waitingKey, activeKey, rpdKey, resultKey, metaKey] = keys;
        const [dayTtl, finishedAt, updatedAt, status, err, errCode, jobId] = args;

        const decrClamp = (key: string) => {
          if (!key || key === '__nil__') return;
          const next = this.decr(key);
          if (next < 0) this.set(key, 0);
        };

        decrClamp(waitingKey);
        if (activeKey && activeKey !== '__nil__' && jobId) {
          this.zrem(activeKey, jobId);
        }
        if (rpdKey && rpdKey !== '__nil__') {
          decrClamp(rpdKey);
          if (dayTtl > 0) this.expire(rpdKey, Number(dayTtl));
        }

        this.hset(resultKey, {
          status,
          error: err,
          error_code: errCode,
          finished_at: finishedAt,
          expired_at: finishedAt,
        });
        this.hset(metaKey, { status, updated_at: updatedAt });
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
          del(...keys: string[]) {
            self.del(...keys);
            ops.push([null, 1]);
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
          zremrangebyscore(key: string, min: number | string, max: number | string) {
            const res = self.zremrangebyscore(key, min, max);
            ops.push([null, res]);
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
  }
);
