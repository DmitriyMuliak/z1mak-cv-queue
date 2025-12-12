import Redis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { luaScripts } from './scripts';

export interface RedisWithScripts extends Redis {
  combinedCheckAndAcquire(
    keys: [string, string],
    args: [number, number, number, number, number, number, string]
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

export const createRedisClient = (options: RedisOptions = {}): RedisWithScripts => {
  const client = new Redis(env.redisUrl, options);

  client.defineCommand('combinedCheckAndAcquire', {
    numberOfKeys: 2,
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
