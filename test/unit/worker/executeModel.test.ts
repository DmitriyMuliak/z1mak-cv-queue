import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExecuteModel } from '../../../src/worker/executeModel';
import { RedisBehavioralDriver } from '../../helpers/RedisBehavioralDriver';
import { redisKeys } from '../../../src/redis/keys';

describe('executeModel with streaming (Behavioral)', () => {
  let redisDriver: RedisBehavioralDriver;
  let modelProvider: any;
  let executeModel: any;

  beforeEach(async () => {
    redisDriver = new RedisBehavioralDriver();
    await redisDriver.instance.flushall();

    modelProvider = {
      execute: vi.fn(),
      executeStream: vi.fn(),
    };
    executeModel = createExecuteModel(modelProvider, redisDriver.instance);
  });

  it('streams chunks and adds to redis stream when streaming is enabled', async () => {
    const jobId = 'job-streaming';
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

    const result = await executeModel(job);

    expect(result).toEqual({ text: 'chunk1chunk2', usedModel: 'gemini-flash' });

    // Verify stream data
    const streamKey = redisKeys.jobStream(jobId);
    const streamData = await redisDriver.instance.xrange(streamKey, '-', '+');

    // Expected 3 messages: chunk1, chunk2, done
    expect(streamData).toHaveLength(3);

    expect(JSON.parse(streamData[0][1][1])).toEqual({ type: 'chunk', data: 'chunk1' });
    expect(JSON.parse(streamData[1][1][1])).toEqual({ type: 'chunk', data: 'chunk2' });
    expect(JSON.parse(streamData[2][1][1])).toEqual({ type: 'done' });

    // Verify TTLs (both safety and completed)
    const streamTtl = await redisDriver.instance.ttl(streamKey);
    expect(streamTtl).toBeGreaterThan(0);
  });

  it('adds error to stream and rethrows when stream fails', async () => {
    const jobId = 'job-error';
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

    await expect(executeModel(job)).rejects.toThrow('Stream failed');

    const streamKey = redisKeys.jobStream(jobId);
    const streamData = await redisDriver.instance.xrange(streamKey, '-', '+');

    // Check that error was added to stream
    const errorEvent = JSON.parse(streamData[1][1][1]);
    expect(errorEvent).toMatchObject({
      type: 'error',
      code: 'STREAM_ERR',
      message: 'Stream failed',
    });

    const streamTtl = await redisDriver.instance.ttl(streamKey);
    expect(streamTtl).toBeGreaterThan(0);
  });
});
