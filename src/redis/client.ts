import Redis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { luaScripts } from './scripts';

export interface RedisWithScripts extends Redis {
  combinedCheckAndAcquire(
    keys: [string, string],
    args: [number, number, number, number, number, number, string]
  ): Promise<number>;

  consumeExecutionLimits(
    keys: [string, string, string],
    args: [number, number, number, number, number, number, number]
  ): Promise<number>;
}

export const createRedisClient = (options: RedisOptions = {}): RedisWithScripts => {
  const client = new Redis(env.redisUrl, options);

  client.defineCommand('combinedCheckAndAcquire', {
    numberOfKeys: 2,
    lua: luaScripts.combinedCheckAndAcquire,
  });

  client.defineCommand('consumeExecutionLimits', {
    numberOfKeys: 3,
    lua: luaScripts.consumeExecutionLimits,
  });

  return client as RedisWithScripts;
};
