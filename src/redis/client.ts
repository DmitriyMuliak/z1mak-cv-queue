import Redis, { RedisOptions } from "ioredis";
import { env } from "../config/env";
import { luaScripts } from "./scripts";

export interface RedisWithScripts extends Redis {
  concurrencyLock(
    key: string,
    nowMs: number,
    ttlMs: number,
    maxConcurrency: number,
    jobId: string,
    isAdmin: boolean
  ): Promise<number>;
  userRpdCheck(
    key: string,
    increment: number,
    allowed: number,
    updatedAt: string,
    isAdmin: boolean
  ): Promise<number>;
}

export const createRedisClient = (options: RedisOptions = {}): RedisWithScripts => {
  const client = new Redis(env.redisUrl, options);

  client.defineCommand("concurrencyLock", {
    numberOfKeys: 1,
    lua: luaScripts.concurrencyLock,
  });

  client.defineCommand("userRpdCheck", {
    numberOfKeys: 1,
    lua: luaScripts.userRpdCheck,
  });

  return client as RedisWithScripts;
};
