import { FastifyInstance } from 'fastify';
import os from 'os';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    const redisOk = await fastify.redis
      .ping()
      .then(() => true)
      .catch(() => false);

    let queueReady = false;
    let queuePaused = false;
    let queueError: string | null = null;
    try {
      await Promise.all([
        fastify.queueLite.waitUntilReady(),
        fastify.queueHard.waitUntilReady(),
      ]);
      queueReady = true;
      const [litePaused, hardPaused] = await Promise.all([
        fastify.queueLite.isPaused(),
        fastify.queueHard.isPaused(),
      ]);
      queuePaused = Boolean(litePaused) || Boolean(hardPaused);
    } catch (err) {
      queueError = (err as Error)?.message ?? 'queue_not_ready';
    }

    const memory = process.memoryUsage();

    const payload = {
      redis: redisOk ? 'ok' : 'error',
      queueReady,
      queuePaused: queuePaused ?? false,
      queueError,
      workers: 0, // worker count not tracked in API process
      ram: memory.rss,
      cpu: os.loadavg()[0],
      uptime: process.uptime() * 1000,
    };

    if (!queueReady) {
      return { statusCode: 503, ...payload };
    }

    return payload;
  });
}
