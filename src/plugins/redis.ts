import fp from 'fastify-plugin';
import { Queue } from 'bullmq';
import { createRedisClient, RedisWithScripts } from '../redis/client';
import { env } from '../config/env';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisWithScripts;
    queueLite: Queue;
    queueHard: Queue;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const redis = createRedisClient();
  const defaultJobOptions = {
    attempts: 2,
    backoff: { type: 'fixed' as const, delay: 10_000 },
    removeOnComplete: false,
    removeOnFail: false,
  };

  const queueLite = new Queue(env.queueLiteName, {
    connection: { url: env.redisUrl },
    defaultJobOptions,
  });

  const queueHard = new Queue(env.queueHardName, {
    connection: { url: env.redisUrl },
    defaultJobOptions,
  });

  fastify.decorate('redis', redis);
  fastify.decorate('queueLite', queueLite);
  fastify.decorate('queueHard', queueHard);

  fastify.addHook('onClose', async () => {
    await queueLite.close();
    await queueHard.close();
    await redis.quit();
  });
});
