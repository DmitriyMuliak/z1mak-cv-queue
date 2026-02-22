import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedUserLimits } from '../../../src/services/limitsCache';
import { redisKeys } from '../../../src/redis/keys';
import { db } from '../../../src/db/client';
import { RedisBehavioralDriver } from '../../helpers/RedisBehavioralDriver';

vi.mock('../../../src/db/client', () => {
  return {
    db: {
      query: vi.fn(),
    },
  };
});

const dbQuery = db.query as unknown as ReturnType<typeof vi.fn>;

describe('getCachedUserLimits (Behavioral)', () => {
  let redisDriver: RedisBehavioralDriver;
  const userId = 'user-1';

  beforeEach(async () => {
    redisDriver = new RedisBehavioralDriver();
    await redisDriver.instance.flushall();
    dbQuery.mockReset();
  });

  it('returns cached limits without hitting DB', async () => {
    const key = redisKeys.userLimits(userId);
    await redisDriver.instance.hset(key, {
      role: 'admin',
      hard_rpd: '',
      lite_rpd: '',
      max_concurrency: '',
      unlimited: 'true',
    });

    const limits = await getCachedUserLimits(redisDriver.instance, userId, 'user');

    expect(limits).toEqual({
      role: 'admin',
      hard_rpd: null,
      lite_rpd: null,
      max_concurrency: null,
      unlimited: true,
    });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('fetches from DB and caches when missing in Redis', async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          role: 'user',
          hard_rpd: 2,
          lite_rpd: 3,
          max_concurrency: 4,
          unlimited: false,
        },
      ],
    });

    const limits = await getCachedUserLimits(redisDriver.instance, userId, 'user');

    expect(limits).toEqual({
      role: 'user',
      hard_rpd: 2,
      lite_rpd: 3,
      max_concurrency: 4,
      unlimited: false,
    });
    const cached = await redisDriver.instance.hgetall(redisKeys.userLimits(userId));
    expect(cached).toMatchObject({
      role: 'user',
      hard_rpd: '2',
      lite_rpd: '3',
      max_concurrency: '4',
      unlimited: 'false',
    });
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });

  it('falls back to default user limits when DB has no row', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const limits = await getCachedUserLimits(redisDriver.instance, userId, 'user');

    expect(limits).toEqual({
      role: 'user',
      hard_rpd: 1,
      lite_rpd: 4,
      max_concurrency: 2,
      unlimited: false,
    });
    const cached = await redisDriver.instance.hgetall(redisKeys.userLimits(userId));
    expect(cached).toMatchObject({
      role: 'user',
      hard_rpd: '1',
      lite_rpd: '4',
      max_concurrency: '2',
      unlimited: 'false',
    });
  });

  it('falls back to default admin limits when DB has no row', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const limits = await getCachedUserLimits(redisDriver.instance, userId, 'admin');

    expect(limits).toEqual({
      role: 'admin',
      hard_rpd: null,
      lite_rpd: null,
      max_concurrency: null,
      unlimited: true,
    });
    const cached = await redisDriver.instance.hgetall(redisKeys.userLimits(userId));
    expect(cached).toMatchObject({
      role: 'admin',
      unlimited: 'true',
    });
  });
});
