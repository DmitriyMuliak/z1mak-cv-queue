import { redisKeys } from '../redis/keys';
import { getSecondsUntilMidnightPT } from '../utils/time';
import type { RedisWithScripts } from '../redis/client';

export const createReturnTokens = (redis: RedisWithScripts, minuteTtl: number) => {
  return async (model: string) => {
    const dayTtl = getSecondsUntilMidnightPT();
    await redis.returnTokensAtomic(
      [redisKeys.modelRpm(model), redisKeys.modelRpd(model), '__nil__'],
      [1, minuteTtl, dayTtl, 0]
    );
  };
};
