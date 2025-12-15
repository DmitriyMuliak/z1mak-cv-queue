import { redisKeys } from '../redis/keys';
import { getSecondsUntilMidnightPT } from '../utils/time';
import type { RedisWithScripts } from '../redis/client';

export const createConsumeModelLimits = (redis: RedisWithScripts, minuteTtl: number) => {
  return async (
    model: string,
    limits: { modelRpm: number; modelRpd: number }
  ): Promise<number> => {
    const dayTtl = getSecondsUntilMidnightPT();
    return redis.consumeExecutionLimits(
      [redisKeys.modelRpm(model), redisKeys.modelRpd(model)],
      [limits.modelRpm, limits.modelRpd, minuteTtl, dayTtl, 1]
    );
  };
};
