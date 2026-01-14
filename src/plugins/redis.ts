import fp from 'fastify-plugin';
import { Queue } from 'bullmq';
import { createRedisClient, RedisWithScripts } from '../redis/client';
import { env } from '../config/env';
import { onShutdown, ShutdownPriority } from '../utils/shutdownEmitter';
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

  let queuesClosed = false;
  let redisClosed = false;

  const closeQueues = async () => {
    if (queuesClosed) return;
    queuesClosed = true;

    try {
      await queueLite.close();
    } catch (err) {
      fastify.log.error(err, 'queueLite close failed');
    }

    try {
      await queueHard.close();
    } catch (err) {
      fastify.log.error(err, 'queueHard close failed');
    }
  };

  const closeRedis = async () => {
    if (redisClosed) return;
    redisClosed = true;

    try {
      await redis.quit();
    } catch (err) {
      fastify.log.error(err, 'redis quit failed');
    }
  };

  onShutdown(closeQueues, ShutdownPriority.QUEUES);
  onShutdown(closeRedis, ShutdownPriority.REDIS);
});
