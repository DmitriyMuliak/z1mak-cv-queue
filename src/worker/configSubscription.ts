import { redisChannels } from '../redis/channels';
import type { RedisWithScripts } from '../redis/client';

type ConfigSubscriptionDeps = {
  subRedis: RedisWithScripts;
  refreshConcurrency: () => Promise<void>;
};

export const createConfigSubscription = ({ subRedis, refreshConcurrency }: ConfigSubscriptionDeps) => {
  return async () => {
    try {
      await subRedis.subscribe(redisChannels.configUpdate, async () => {
        await refreshConcurrency();
      });
    } catch (err) {
      console.error('Failed to subscribe to config updates', err);
    }
  };
};
