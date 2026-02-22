import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExecuteModel } from '../../../src/worker/executeModel';
import { RedisBehavioralDriver } from '../../helpers/RedisBehavioralDriver';
import { redisKeys } from '../../../src/redis/keys';
import { STREAM_TTL_SAFETY, STREAM_TTL_COMPLETED } from '../../../src/constants/jobKeys';

describe('executeModel with streaming (Behavioral)', () => {
  let redisDriver: RedisBehavioralDriver;
  let modelProvider: any;
  let executeModel: any;

  beforeEach(() => {
    redisDriver = new RedisBehavioralDriver();

    modelProvider = {
      execute: vi.fn(),
      executeStream: vi.fn(),
    };
    executeModel = createExecuteModel(modelProvider, redisDriver.instance);
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

    await redisDriver.setupModelLimits('gemini-flash', 100, 100);

    modelProvider.executeStream.mockImplementation(async function* () {
      yield 'chunk1';
      yield 'chunk2';
    });

    const xaddSpy = vi.spyOn(redisDriver.instance, 'xadd');
    const expireSpy = vi.spyOn(redisDriver.instance, 'expire');

    const result = await executeModel(job);

    expect(result).toEqual({ text: 'chunk1chunk2', usedModel: 'gemini-flash' });
    expect(xaddSpy).toHaveBeenCalledTimes(3); // 2 chunks + 1 done

    expect(xaddSpy).toHaveBeenNthCalledWith(
      1,
      redisKeys.jobStream(jobId),
      '*',
      'data',
      JSON.stringify({ type: 'chunk', data: 'chunk1' })
    );

    expect(expireSpy).toHaveBeenCalledWith(redisKeys.jobStream(jobId), STREAM_TTL_SAFETY);
    expect(expireSpy).toHaveBeenCalledWith(
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

    await redisDriver.setupModelLimits('gemini-flash', 100, 100);

    const streamError = new Error('Stream failed');
    (streamError as any).code = 'STREAM_ERR';

    modelProvider.executeStream.mockImplementation(async function* () {
      yield 'chunk1';
      throw streamError;
    });

    const xaddSpy = vi.spyOn(redisDriver.instance, 'xadd');

    await expect(executeModel(job)).rejects.toThrow('Stream failed');

    expect(xaddSpy).toHaveBeenCalledWith(
      redisKeys.jobStream(jobId),
      '*',
      'data',
      JSON.stringify({
        type: 'error',
        code: 'STREAM_ERR',
        message: 'Stream failed',
      })
    );
  });
});
