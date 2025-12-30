import Redis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { luaScripts } from './scripts';

export interface RedisWithScripts extends Redis {
  combinedCheckAndAcquire(
    keys: [string, string, string],
    args: [number, number, number, number, number, number, string, number, number]
  ): Promise<number>;

  consumeExecutionLimits(
    keys: [string, string],
    args: [number, number, number, number, number]
  ): Promise<number>;

  returnTokensAtomic(
    keys: [string, string, string],
    args: [number, number, number, number]
  ): Promise<[number | null, number | null, number | null]>;

  expireStaleJob(
    keys: [string, string, string, string, string],
    args: [number, string, string, string, string, string, string]
  ): Promise<number>;

  decrAndClampToZero(keys: [string]): Promise<number>;
}

const resolveRedisFamily = (): RedisOptions['family'] => {
  const override = process.env.REDIS_FAMILY;
  if (override) {
    const parsed = Number(override);
    if (parsed === 4 || parsed === 6) return parsed;
  }

  try {
    const hostname = new URL(env.redisUrl).hostname;
    if (hostname.endsWith('.internal')) {
      return 6; // Fly.io internal DNS resolves AAAA only
    }
  } catch {
    return undefined;
  }

  return undefined;
};

export const createRedisClient = (options: RedisOptions = {}): RedisWithScripts => {
  const family = resolveRedisFamily();
  const client = new Redis(env.redisUrl, {
    ...(family ? { family } : {}),
    lazyConnect: true,
    connectTimeout: 10000,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },
    ...options,
  });

  client.defineCommand('combinedCheckAndAcquire', {
    numberOfKeys: 3,
    lua: luaScripts.combinedCheckAndAcquire,
  });

  client.defineCommand('consumeExecutionLimits', {
    numberOfKeys: 2,
    lua: luaScripts.consumeExecutionLimits,
  });

  client.defineCommand('returnTokensAtomic', {
    numberOfKeys: 3,
    lua: luaScripts.returnTokensAtomic,
  });

  client.defineCommand('expireStaleJob', {
    numberOfKeys: 5,
    lua: luaScripts.expireStaleJob,
  });

  client.defineCommand('decrAndClampToZero', {
    numberOfKeys: 1,
    lua: luaScripts.decrAndClampToZero,
  });

  return client as RedisWithScripts;
};
