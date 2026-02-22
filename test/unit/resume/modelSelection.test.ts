import { describe, it, expect, beforeEach } from 'vitest';
import { selectAvailableModel } from '../../../src/routes/resume/modelSelection';
import { AcquireCode } from '../../../src/types/queueCodes';
import type { UserLimits } from '../../../src/services/limitsCache';
import { RedisBehavioralDriver } from '../../helpers/RedisBehavioralDriver';

const baseLimits: UserLimits = {
  hard_rpd: 10,
  lite_rpd: 10,
  max_concurrency: 5,
  unlimited: false,
  role: 'user',
};

describe('selectAvailableModel (Behavioral)', () => {
  let redisDriver: RedisBehavioralDriver;
  let todayPT: string;
  let dayTtl: number;
  let now: number;
  let userLimits: UserLimits;

  beforeEach(async () => {
    redisDriver = new RedisBehavioralDriver();
    todayPT = '2024-01-01';
    dayTtl = 1000;
    now = Date.now();
    userLimits = { ...baseLimits };

    // Setup models
    await redisDriver.setupModelLimits('m1', 100, 100);
    await redisDriver.setupModelLimits('m2', 50, 50);
  });

  it('selects the first model when acquire is OK', async () => {
    redisDriver.simulateScript('combinedCheckAndAcquire', () => AcquireCode.OK);

    const res = await selectAvailableModel({
      redis: redisDriver.instance,
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
    const responses = [AcquireCode.ModelRpdExceeded, AcquireCode.OK];
    redisDriver.simulateScript('combinedCheckAndAcquire', () => responses.shift());

    const res = await selectAvailableModel({
      redis: redisDriver.instance,
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
    redisDriver.simulateScript(
      'combinedCheckAndAcquire',
      () => AcquireCode.ConcurrencyExceeded
    );

    const res = await selectAvailableModel({
      redis: redisDriver.instance,
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
    redisDriver.simulateScript(
      'combinedCheckAndAcquire',
      () => AcquireCode.UserRpdExceeded
    );

    const res = await selectAvailableModel({
      redis: redisDriver.instance,
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
    const responses = [AcquireCode.ModelRpdExceeded, AcquireCode.ModelRpdExceeded];
    redisDriver.simulateScript('combinedCheckAndAcquire', () => responses.shift());

    const res = await selectAvailableModel({
      redis: redisDriver.instance,
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
