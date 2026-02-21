import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExecuteModel } from '../../../src/worker/executeModel';
import { FakeRedis } from '../../mock/Redis';
import { redisKeys } from '../../../src/redis/keys';
import { STREAM_TTL_SAFETY, STREAM_TTL_COMPLETED } from '../../../src/constants/jobKeys';

describe('executeModel with streaming', () => {
  let redis: any;
  let modelProvider: any;
  let executeModel: any;

  beforeEach(() => {
    redis = new FakeRedis() as any;
    redis.xadd = vi.fn().mockResolvedValue('1-0');
    redis.expire = vi.fn().mockResolvedValue(1);
    modelProvider = {
      execute: vi.fn(),
      executeStream: vi.fn(),
    };
    executeModel = createExecuteModel(modelProvider, redis);
  });

  it('streams chunks and adds to redis stream when streaming is enabled', async () => {
    const jobId = 'job-123';
    const job: any = {
      id: jobId,
      data: {
        model: 'gemini-flash',
        payload: {
          cvDescription: 'cv',
          mode: 'lite',
          locale: 'en',
        },
        streaming: true,
      },
    };

    redis.hset(redisKeys.modelLimits('gemini-flash'), { api_name: 'gemini-1.5-flash' });

    modelProvider.executeStream.mockImplementation(async function* () {
      yield 'chunk1';
      yield 'chunk2';
    });

    const result = await executeModel(job);

    expect(result).toEqual({ text: 'chunk1chunk2', usedModel: 'gemini-flash' });
    expect(redis.xadd).toHaveBeenCalledTimes(3); // 2 chunks + 1 done
    expect(redis.xadd).toHaveBeenNthCalledWith(
      1,
      redisKeys.jobStream(jobId),
      '*',
      'data',
      JSON.stringify({ type: 'chunk', data: 'chunk1' })
    );
    expect(redis.xadd).toHaveBeenNthCalledWith(
      2,
      redisKeys.jobStream(jobId),
      '*',
      'data',
      JSON.stringify({ type: 'chunk', data: 'chunk2' })
    );
    expect(redis.xadd).toHaveBeenNthCalledWith(
      3,
      redisKeys.jobStream(jobId),
      '*',
      'data',
      JSON.stringify({ type: 'done' })
    );

    expect(redis.expire).toHaveBeenCalledWith(
      redisKeys.jobStream(jobId),
      STREAM_TTL_SAFETY
    );
    expect(redis.expire).toHaveBeenCalledWith(
      redisKeys.jobStream(jobId),
      STREAM_TTL_COMPLETED
    );
  });

  it('adds error to stream and rethrows when stream fails', async () => {
    const jobId = 'job-123';
    const job: any = {
      id: jobId,
      data: {
        model: 'gemini-flash',
        payload: {
          cvDescription: 'cv',
          mode: 'lite',
          locale: 'en',
        },
        streaming: true,
      },
    };

    redis.hset(redisKeys.modelLimits('gemini-flash'), { api_name: 'gemini-1.5-flash' });

    const streamError = new Error('Stream failed');
    (streamError as any).code = 'STREAM_ERR';

    modelProvider.executeStream.mockImplementation(async function* () {
      yield 'chunk1';
      throw streamError;
    });

    await expect(executeModel(job)).rejects.toThrow('Stream failed');

    expect(redis.xadd).toHaveBeenCalledWith(
      redisKeys.jobStream(jobId),
      '*',
      'data',
      JSON.stringify({ type: 'chunk', data: 'chunk1' })
    );
    expect(redis.xadd).toHaveBeenCalledWith(
      redisKeys.jobStream(jobId),
      '*',
      'data',
      JSON.stringify({
        type: 'error',
        code: 'STREAM_ERR',
        message: 'Stream failed',
      })
    );
    expect(redis.expire).toHaveBeenCalledWith(
      redisKeys.jobStream(jobId),
      STREAM_TTL_COMPLETED
    );
  });
});
