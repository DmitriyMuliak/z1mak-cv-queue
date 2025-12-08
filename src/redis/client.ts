import Redis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { luaScripts } from './scripts';

export interface RedisWithScripts extends Redis {
  combinedCheckAndAcquire(
    keys: [string, string, string, string, string],
    args: [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      string,
      number,
    ]
  ): Promise<number>;
}

export const createRedisClient = (options: RedisOptions = {}): RedisWithScripts => {
  const client = new Redis(env.redisUrl, options);

  client.defineCommand('combinedCheckAndAcquire', {
    numberOfKeys: 5,
    lua: luaScripts.combinedCheckAndAcquire,
  });

  return client as RedisWithScripts;
};
