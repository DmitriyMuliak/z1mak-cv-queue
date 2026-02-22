import RedisMock from 'ioredis-mock';
import { vi } from 'vitest';
import { redisKeys } from '../../src/redis/keys';
import type { Redis } from 'ioredis';
import type { RedisWithScripts } from '../../src/redis/client';

type CustomScriptsOnly = Omit<RedisWithScripts, keyof Redis>;
export type MockRedisWithScripts = InstanceType<typeof RedisMock> & CustomScriptsOnly;

/**
 * RedisBehavioralDriver wraps a real-ish Redis (ioredis-mock)
 * and provides high-level domain actions for tests.
 */
export class RedisBehavioralDriver {
  public instance: MockRedisWithScripts;

  constructor() {
    this.instance = new RedisMock() as unknown as MockRedisWithScripts;

    // Polyfill xread for ioredis-mock to support our streaming logic
    this.instance.xread = async (...args: any[]) => {
      let key: string;
      let lastId: string;

      if (args[0] === 'BLOCK') {
        key = args[3];
        lastId = args[4];
      } else {
        // xread STREAMS key lastId
        key = args[1];
        lastId = args[2];
      }

      const entries = this.streams.get(key) || [];
      const filtered =
        lastId === '0' || !lastId ? entries : entries.filter((e) => e.id > lastId);

      if (filtered.length === 0) return null;
      return [[key, filtered.map((e) => [e.id, ['data', e.data]])]];
    };
  }

  private streams = new Map<string, Array<{ id: string; data: string }>>();

  /**
   * Sets up a job in an active state (queued or processing).
   */
  async setupActiveJob(jobId: string, status: 'queued' | 'processing' = 'processing') {
    const metaKey = redisKeys.jobMeta(jobId);
    await this.instance.hset(metaKey, {
      status,
      streaming: 'true',
      updated_at: new Date().toISOString(),
    });

    if (status === 'processing') {
      const streamKey = redisKeys.jobStream(jobId);
      await this.instance.set(streamKey, 'active');
      if (!this.streams.has(streamKey)) this.streams.set(streamKey, []);
    }
  }

  /**
   * Sets up model limits in Redis.
   */
  async setupModelLimits(modelId: string, rpm: number, rpd: number) {
    const key = redisKeys.modelLimits(modelId);
    await this.instance.hset(key, {
      rpm: String(rpm),
      rpd: String(rpd),
      api_name: modelId,
    });
  }

  /**
   * Sets up a user's active job in the ZSET.
   */
  async setupUserActiveJob(userId: string, jobId: string, score: number = Date.now()) {
    const key = redisKeys.userActiveJobs(userId);
    await this.instance.zadd(key, score, jobId);
  }

  /**
   * Simulates the outcome of a custom Lua script or method.
   */
  simulateScript(name: keyof CustomScriptsOnly, implementation: any) {
    (this.instance as Record<string, any>)[name] = vi
      .fn()
      .mockImplementation(implementation);
  }

  /**
   * Sets up a job that is already finished.
   */
  async setupFinishedJob(jobId: string, resultData: any) {
    const resultKey = redisKeys.jobResult(jobId);
    await this.instance.hset(resultKey, {
      status: 'completed',
      data: JSON.stringify(resultData),
      finished_at: new Date().toISOString(),
    });
  }

  /**
   * Simulates AI pushing a chunk or event to the stream.
   */
  async pushToStream(jobId: string, type: 'chunk' | 'done' | 'error', data?: any) {
    const streamKey = redisKeys.jobStream(jobId);
    const payload = typeof data === 'string' ? { type, data } : { type, ...data };
    const dataStr = JSON.stringify(payload);

    // Track in our local map for the polyfill
    const entries = this.streams.get(streamKey) || [];
    const id = `${Date.now()}-${entries.length}`;
    entries.push({ id, data: dataStr });
    this.streams.set(streamKey, entries);

    // Also push to real ioredis-mock if it supports it
    await this.instance.xadd(streamKey, id, 'data', dataStr);
  }

  /**
   * Forcefully expires/deletes a stream key.
   */
  async expireStream(jobId: string) {
    const streamKey = redisKeys.jobStream(jobId);
    await this.instance.del(streamKey);
  }
}
