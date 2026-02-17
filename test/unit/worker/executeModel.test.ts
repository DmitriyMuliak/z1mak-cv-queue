import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExecuteModel } from '../../../src/worker/executeModel';
import { FakeRedis } from '../../mock/Redis';
import { redisKeys } from '../../../src/redis/keys';
import { redisChannels } from '../../../src/redis/channels';

describe('executeModel with streaming', () => {
  let redis: any;
  let modelProvider: any;
  let executeModel: any;

  beforeEach(() => {
    redis = new FakeRedis() as any;
    redis.publish = vi.fn().mockResolvedValue(0);
    modelProvider = {
      execute: vi.fn(),
      executeStream: vi.fn(),
    };
    executeModel = createExecuteModel(modelProvider, redis);
  });

  it('streams chunks and publishes to redis when streaming is enabled', async () => {
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
    expect(redis.publish).toHaveBeenCalledTimes(3); // 2 chunks + 1 done
    expect(redis.publish).toHaveBeenNthCalledWith(
      1,
      redisChannels.jobStream(jobId),
      JSON.stringify({ type: 'chunk', data: 'chunk1' })
    );
    expect(redis.publish).toHaveBeenNthCalledWith(
      2,
      redisChannels.jobStream(jobId),
      JSON.stringify({ type: 'chunk', data: 'chunk2' })
    );
    expect(redis.publish).toHaveBeenNthCalledWith(
      3,
      redisChannels.jobStream(jobId),
      JSON.stringify({ type: 'done' })
    );
  });

  it('publishes error and rethrows when stream fails', async () => {
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

    expect(redis.publish).toHaveBeenCalledWith(
      redisChannels.jobStream(jobId),
      JSON.stringify({ type: 'chunk', data: 'chunk1' })
    );
    expect(redis.publish).toHaveBeenCalledWith(
      redisChannels.jobStream(jobId),
      JSON.stringify({
        type: 'error',
        code: 'STREAM_ERR',
        message: 'Stream failed',
      })
    );
  });
});
