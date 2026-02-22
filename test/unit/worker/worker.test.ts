import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { createConsumeLimitsIfNeeded } from '../../../src/worker/consumeLimitsIfNeeded';
import { createQueueEventsRegistrar } from '../../../src/worker/queueEvents';
import { finalizeFailure } from '../../../src/worker/finalizeFailure';
import { redisKeys } from '../../../src/redis/keys';
import { ConsumeCode } from '../../../src/types/queueCodes';
import { RedisBehavioralDriver } from '../../helpers/RedisBehavioralDriver';
import { MISSING_RESULT_GRACE_MS } from '../../../src/constants/jobKeys';

describe('consumeLimitsIfNeeded (Behavioral)', () => {
  const consumeModelLimits = vi.fn();
  let redisDriver: RedisBehavioralDriver;

  const job: any = {
    id: 'job-1',
    token: 'token-1',
    data: { model: 'm1' },
    moveToDelayed: vi.fn(),
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    redisDriver = new RedisBehavioralDriver();
    await redisDriver.instance.flushall();
  });

  it('delays job when model RPM exceeded', async () => {
    const consumeLimits = createConsumeLimitsIfNeeded({
      redis: redisDriver.instance,
      consumeModelLimits,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    await redisDriver.setupModelLimits('m1', 100, 100);
    vi.spyOn(redisDriver.instance, 'ttl').mockResolvedValue(5 as any);
    consumeModelLimits.mockResolvedValue(ConsumeCode.ModelRpmExceeded);

    const res = await consumeLimits(job as any, false);
    const expected = Date.now() + 5000;

    expect(res).toBe('delayed');
    const meta = await redisDriver.instance.hgetall(redisKeys.jobMeta('job-1'));
    expect(meta).toMatchObject({ status: 'queued' });
    expect(job.moveToDelayed).toHaveBeenCalledWith(expected, 'token-1');
    vi.useRealTimers();
  });

  it('throws UnrecoverableError when model RPD exceeded', async () => {
    const consumeLimits = createConsumeLimitsIfNeeded({
      redis: redisDriver.instance,
      consumeModelLimits,
    });
    await redisDriver.setupModelLimits('m1', 100, 100);
    consumeModelLimits.mockResolvedValue(ConsumeCode.ModelRpdExceeded);

    await expect(consumeLimits(job as any, false)).rejects.toBeInstanceOf(
      UnrecoverableError
    );
  });

  it('marks tokens consumed when limits are OK', async () => {
    const consumeLimits = createConsumeLimitsIfNeeded({
      redis: redisDriver.instance,
      consumeModelLimits,
    });
    await redisDriver.setupModelLimits('m1', 100, 100);
    consumeModelLimits.mockResolvedValue(ConsumeCode.OK);

    const res = await consumeLimits(job as any, false);

    expect(res).toBe('consumed');
    const meta = await redisDriver.instance.hgetall(redisKeys.jobMeta('job-1'));
    expect(meta.tokens_consumed).toBe('true');
  });
});

describe('queueEvents failed handler (Behavioral)', () => {
  let returnTokens: any;
  let redisDriver: RedisBehavioralDriver;
  let queue: any;
  let queues: any;
  let handlerPromise: Promise<any> | undefined;
  let queueEventMock: any;

  beforeEach(async () => {
    returnTokens = vi.fn();
    redisDriver = new RedisBehavioralDriver();
    await redisDriver.instance.flushall();
    redisDriver.simulateScript('decrAndClampToZero', () => 0);
    queue = { getJob: vi.fn() };
    queues = { lite: queue as any, hard: queue as any };
    handlerPromise = undefined;
    queueEventMock = {
      on: vi.fn((event: string, handler: any) => {
        handlerPromise = handler({ jobId: 'j1', failedReason: 'USER_RPD_EXCEEDED' });
      }),
    } as any;
  });

  it('returns tokens and marks limit errors with limit code on final attempt', async () => {
    queue.getJob.mockResolvedValue({
      attemptsMade: 2,
      opts: { attempts: 2 },
      getState: vi.fn().mockResolvedValue('failed'),
    });

    await redisDriver.instance.hset(redisKeys.jobMeta('j1'), {
      user_id: 'u1',
      processed_model: 'm1',
      tokens_consumed: 'true',
      provider_completed: 'false',
    });
    await redisDriver.setupUserActiveJob('u1', 'j1');

    const register = createQueueEventsRegistrar({
      redis: redisDriver.instance,
      queues,
      returnTokens,
    });

    const decrSpy = vi.spyOn(redisDriver.instance, 'decrAndClampToZero');

    await register(queueEventMock, 'lite');
    await handlerPromise;

    expect(returnTokens).toHaveBeenCalledWith('m1');
    const result = await redisDriver.instance.hgetall(redisKeys.jobResult('j1'));
    expect(result.error_code).toBe('USER_RPD_LIMIT:lite');
    expect(result.status).toBe('failed');

    const activeJobs = await redisDriver.instance.zscore(
      redisKeys.userActiveJobs('u1'),
      'j1'
    );
    expect(activeJobs).toBeNull();

    expect(decrSpy).toHaveBeenCalledWith([redisKeys.queueWaitingModel('m1')]);

    // Check stream notification and TTL
    const streamKey = redisKeys.jobStream('j1');
    const streamTtl = await redisDriver.instance.ttl(streamKey);
    expect(streamTtl).toBeGreaterThan(0);

    const streamData = await redisDriver.instance.xrange(streamKey, '-', '+');
    const errorEvent = JSON.parse(streamData[0][1][1]);
    expect(errorEvent).toMatchObject({
      type: 'error',
      code: 'USER_RPD_LIMIT:lite',
      message: 'USER_RPD_EXCEEDED',
    });

    // We expect expire to be called, which sets TTL
    const metaTtl = await redisDriver.instance.ttl(redisKeys.jobMeta('j1'));
    expect(metaTtl).toBeGreaterThan(0);
  });

  it('skips work on non-final attempts', async () => {
    queue.getJob.mockResolvedValue({
      attemptsMade: 0,
      opts: { attempts: 2 },
      getState: vi.fn().mockResolvedValue('waiting'),
    });

    const register = createQueueEventsRegistrar({
      redis: redisDriver.instance,
      queues,
      returnTokens,
    });

    await register(queueEventMock, 'lite');
    if (handlerPromise) await handlerPromise;

    expect(returnTokens).not.toHaveBeenCalled();
    // No results should be written
    const result = await redisDriver.instance.hgetall(redisKeys.jobResult('j1'));
    expect(Object.keys(result).length).toBe(0);
  });

  it('marks failed when state is failed even if attempts remain', async () => {
    queue.getJob.mockResolvedValue({
      attemptsMade: 0,
      opts: { attempts: 2 },
      discarded: false,
      getState: vi.fn().mockResolvedValue('failed'),
    });
    await redisDriver.instance.hset(redisKeys.jobMeta('j1'), {
      user_id: 'u1',
      processed_model: 'm1',
      tokens_consumed: 'true',
      provider_completed: 'false',
    });

    const register = createQueueEventsRegistrar({
      redis: redisDriver.instance,
      queues,
      returnTokens,
    });

    await register(queueEventMock, 'lite');
    if (handlerPromise) await handlerPromise;

    expect(returnTokens).toHaveBeenCalledWith('m1');
    const result = await redisDriver.instance.hgetall(redisKeys.jobResult('j1'));
    expect(result).toMatchObject({
      status: 'failed',
      error: 'USER_RPD_EXCEEDED',
      error_code: 'USER_RPD_LIMIT:lite',
    });
  });

  it('marks meta-only as failed when grace exceeded', async () => {
    const now = Date.now();
    queue.getJob.mockResolvedValue(null);
    await redisDriver.instance.hset(redisKeys.jobMeta('j1'), {
      user_id: 'u1',
      requested_model: 'm1',
      processed_model: 'm1',
      status: 'in_progress',
      created_at: new Date(now - MISSING_RESULT_GRACE_MS - 1).toISOString(),
      updated_at: new Date(now - MISSING_RESULT_GRACE_MS - 1).toISOString(),
    });

    const register = createQueueEventsRegistrar({
      redis: redisDriver.instance,
      queues,
      returnTokens,
    });

    await register(queueEventMock, 'lite');
    if (handlerPromise) await handlerPromise;

    const result = await redisDriver.instance.hgetall(redisKeys.jobResult('j1'));
    expect(result).toMatchObject({
      status: 'failed',
      error: 'USER_RPD_EXCEEDED',
      error_code: 'USER_RPD_LIMIT:lite',
    });
  });
});

describe('finalizeFailure', () => {
  it('wraps non-retryable errors in UnrecoverableError', () => {
    expect(() => finalizeFailure({ retryable: false, message: 'fatal' })).toThrow(
      UnrecoverableError
    );
  });

  it('rethrows retryable errors as-is', () => {
    const err = new Error('retry');
    expect(() => finalizeFailure(err)).toThrow(err);
  });
});
