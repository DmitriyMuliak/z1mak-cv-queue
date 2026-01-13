import { describe, it, expect, beforeEach } from 'vitest';
import { selectAvailableModel } from '../../../src/routes/resume/modelSelection';
import { AcquireCode } from '../../../src/types/queueCodes';
import type { UserLimits } from '../../../src/services/limitsCache';
import { redisKeys } from '../../../src/redis/keys';

const baseLimits: UserLimits = {
  hard_rpd: 10,
  lite_rpd: 10,
  max_concurrency: 5,
  unlimited: false,
  role: 'user',
};

type MockRedis = {
  hgetall: (key: string) => Promise<Record<string, string>>;
  combinedCheckAndAcquire: () => Promise<AcquireCode>;
};

const createMockRedis = (responses: AcquireCode[]): MockRedis => {
  const limits = new Map<string, Record<string, string>>();
  const addModel = (id: string, rpm: number, rpd: number) => {
    limits.set(redisKeys.modelLimits(id), { rpm: String(rpm), rpd: String(rpd) });
  };

  addModel('m1', 100, 100);
  addModel('m2', 50, 50);

  return {
    hgetall: async (key: string) => limits.get(key) ?? {},
    combinedCheckAndAcquire: async () =>
      responses.shift() ?? AcquireCode.ModelRpdExceeded,
  };
};

describe('selectAvailableModel', () => {
  let todayPT: string;
  let dayTtl: number;
  let now: number;
  let userLimits: UserLimits;

  beforeEach(() => {
    todayPT = '2024-01-01';
    dayTtl = 1000;
    now = Date.now();
    userLimits = { ...baseLimits };
  });

  it('selects the first model when acquire is OK', async () => {
    const redis = createMockRedis([AcquireCode.OK]);
    const res = await selectAvailableModel({
      redis: redis as any,
      modelChain: ['m1', 'm2'],
      userId: 'u1',
      isAdmin: false,
      userLimits,
      modeType: 'lite',
      todayPT,
      dayTtl,
      now,
      jobId: 'j1',
      concurrencyTtlSeconds: 100,
    });

    expect(res).toEqual({
      status: 'selected',
      model: 'm1',
      modelRpm: 100,
      modelRpd: 100,
    });
  });

  it('skips model when model RPD exceeded and picks fallback', async () => {
    const redis = createMockRedis([AcquireCode.ModelRpdExceeded, AcquireCode.OK]);
    const res = await selectAvailableModel({
      redis: redis as any,
      modelChain: ['m1', 'm2'],
      userId: 'u1',
      isAdmin: false,
      userLimits,
      modeType: 'lite',
      todayPT,
      dayTtl,
      now,
      jobId: 'j1',
      concurrencyTtlSeconds: 100,
    });

    expect(res).toEqual({ status: 'selected', model: 'm2', modelRpm: 50, modelRpd: 50 });
  });

  it('returns concurrency error when exceeded', async () => {
    const redis = createMockRedis([AcquireCode.ConcurrencyExceeded]);
    const res = await selectAvailableModel({
      redis: redis as any,
      modelChain: ['m1'],
      userId: 'u1',
      isAdmin: false,
      userLimits,
      modeType: 'lite',
      todayPT,
      dayTtl,
      now,
      jobId: 'j1',
      concurrencyTtlSeconds: 100,
    });

    expect(res).toEqual({ status: 'error', error: 'CONCURRENCY_LIMIT' });
  });

  it('returns user rpd error when exceeded', async () => {
    const redis = createMockRedis([AcquireCode.UserRpdExceeded]);
    const res = await selectAvailableModel({
      redis: redis as any,
      modelChain: ['m1'],
      userId: 'u1',
      isAdmin: false,
      userLimits,
      modeType: 'lite',
      todayPT,
      dayTtl,
      now,
      jobId: 'j1',
      concurrencyTtlSeconds: 100,
    });

    expect(res).toEqual({ status: 'error', error: 'USER_RPD_LIMIT:lite' });
  });

  it('returns model limit error when no model available', async () => {
    const redis = createMockRedis([
      AcquireCode.ModelRpdExceeded,
      AcquireCode.ModelRpdExceeded,
    ]);
    const res = await selectAvailableModel({
      redis: redis as any,
      modelChain: ['m1', 'm2'],
      userId: 'u1',
      isAdmin: false,
      userLimits,
      modeType: 'lite',
      todayPT,
      dayTtl,
      now,
      jobId: 'j1',
      concurrencyTtlSeconds: 100,
    });

    expect(res).toEqual({ status: 'error', error: 'MODEL_LIMIT' });
  });
});
