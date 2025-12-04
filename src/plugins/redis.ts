import fp from "fastify-plugin";
import { Queue } from "bullmq";
import { createRedisClient, RedisWithScripts } from "../redis/client";
import { env } from "../config/env";
import { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    redis: RedisWithScripts;
    queue: Queue;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const redis = createRedisClient();
  const queue = new Queue(env.queueName, {
    connection: { url: env.redisUrl },
  });

  fastify.decorate("redis", redis);
  fastify.decorate("queue", queue);

  fastify.addHook("onClose", async () => {
    await queue.close();
    await redis.quit();
  });
});
