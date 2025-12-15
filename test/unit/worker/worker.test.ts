import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { createConsumeLimitsIfNeeded } from '../../../src/worker/consumeLimitsIfNeeded';
import { createQueueEventsRegistrar } from '../../../src/worker/queueEvents';
import { finalizeFailure } from '../../../src/worker/finalizeFailure';
import { redisKeys } from '../../../src/redis/keys';
import { ConsumeCode } from '../../../src/types/queueCodes';
import { FakeRedis } from '../../mock/Redis';

describe('consumeLimitsIfNeeded', () => {
  const consumeModelLimits = vi.fn();
  const redis = new FakeRedis() as any;

  const job: any = {
    id: 'job-1',
    token: 'token-1',
    data: { model: 'm1' },
    moveToDelayed: vi.fn(),
  };

  const consumeLimits = createConsumeLimitsIfNeeded({ redis, consumeModelLimits });

  beforeEach(() => {
    vi.restoreAllMocks();
    redis.strings.clear();
    redis.hashes.clear();
  });

  it('delays job when model RPM exceeded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    redis.hset(redisKeys.modelLimits('m1'), { rpm: 10, rpd: 20 });
    vi.spyOn(redis, 'ttl').mockResolvedValue(5 as any);
    consumeModelLimits.mockResolvedValue(ConsumeCode.ModelRpmExceeded);

    const res = await consumeLimits(job as any, false);
    const expected = Date.now() + 5000;

    expect(res).toBe('delayed');
    expect(redis.hgetall(redisKeys.jobMeta('job-1'))).toMatchObject({ status: 'queued' });
    expect(job.moveToDelayed).toHaveBeenCalledWith(expected, 'token-1');
    vi.useRealTimers();
  });

  it('throws UnrecoverableError when model RPD exceeded', async () => {
    redis.hset(redisKeys.modelLimits('m1'), { rpm: 10, rpd: 20 });
    consumeModelLimits.mockResolvedValue(ConsumeCode.ModelRpdExceeded);

    await expect(consumeLimits(job as any, false)).rejects.toBeInstanceOf(
      UnrecoverableError
    );
  });

  it('marks tokens consumed when limits are OK', async () => {
    redis.hset(redisKeys.modelLimits('m1'), { rpm: 10, rpd: 20 });
    consumeModelLimits.mockResolvedValue(ConsumeCode.OK);

    const res = await consumeLimits(job as any, false);

    expect(res).toBe('consumed');
    expect(redis.hgetall(redisKeys.jobMeta('job-1')).tokens_consumed).toBe('true');
  });
});

describe('queueEvents failed handler', () => {
  let returnTokens: any;
  let redis: any;
  let queue: any;
  let queues: any;
  let handlerPromise: Promise<any> | undefined;
  let queueEventMock: any;

  beforeEach(() => {
    returnTokens = vi.fn();
    redis = new FakeRedis() as any;
    redis.reset();
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
    queue.getJob.mockResolvedValue({ attemptsMade: 2, opts: { attempts: 2 } });
    redis.hset(redisKeys.jobMeta('j1'), {
      user_id: 'u1',
      processed_model: 'm1',
      tokens_consumed: 'true',
      provider_completed: 'false',
    });
    redis.decrAndClampToZero = vi.fn();

    const register = createQueueEventsRegistrar({
      redis,
      queues,
      returnTokens,
    });

    await register(queueEventMock, 'lite');
    await handlerPromise;

    expect(returnTokens).toHaveBeenCalledWith('m1');
    const result = redis.hgetall(redisKeys.jobResult('j1'));
    expect(result.error_code).toBe('limit');
    expect(result.status).toBe('failed');
    expect(redis.zsets.get(redisKeys.userActiveJobs('u1'))?.has('j1')).toBeFalsy();
    expect(redis.decrAndClampToZero).toHaveBeenCalledWith([
      redisKeys.queueWaitingModel('m1'),
    ]);
  });

  it('skips work on non-final attempts', async () => {
    queue.getJob.mockResolvedValue({ attemptsMade: 0, opts: { attempts: 2 } });

    const register = createQueueEventsRegistrar({
      redis,
      queues,
      returnTokens,
    });

    await register(queueEventMock, 'lite');
    if (handlerPromise) await handlerPromise;

    expect(returnTokens).not.toHaveBeenCalled();
    expect(redis.hashes.size).toBe(0);
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
