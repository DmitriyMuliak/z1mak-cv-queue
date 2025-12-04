import { FastifyInstance } from "fastify";
import os from "os";

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    const redisOk = await fastify.redis
      .ping()
      .then(() => true)
      .catch(() => false);

    const queuePaused = await fastify.queue.isPaused();

    const memory = process.memoryUsage();

    return {
      redis: redisOk ? "ok" : "error",
      queuePaused: queuePaused ?? false,
      workers: 0, // worker count not tracked in API process
      ram: memory.rss,
      cpu: os.loadavg()[0],
      uptime: process.uptime() * 1000,
    };
  });
}
