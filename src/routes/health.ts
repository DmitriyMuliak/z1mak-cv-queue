import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import os from 'os';
import { db } from '../db/client';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const REQUEST_TIMEOUT = 7000; // 7 seconds (DB gets 5s + buffer)
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Health check timeout')),
          REQUEST_TIMEOUT
        );
      });

      const [redisPing, dbOk, queues] = await Promise.race([
        Promise.all([
          fastify.redis.ping().catch(() => null),
          db.isConnected(),
          Promise.all([
            fastify.queueLite
              .waitUntilReady()
              .then(() => true)
              .catch(() => false),
            fastify.queueHard
              .waitUntilReady()
              .then(() => true)
              .catch(() => false),
            fastify.queueLite.isPaused().catch(() => false),
            fastify.queueHard.isPaused().catch(() => false),
          ]),
        ]),
        timeoutPromise,
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      const [qLiteReady, qHardReady, litePaused, hardPaused] = queues;
      const redisOk = redisPing === 'PONG';
      // BullMQ can restart queues, so skip this indicator for basic health checks
      const queueReady = qLiteReady && qHardReady;

      const isHealthy = redisOk && dbOk;

      const pool = db.getPool();
      const memory = process.memoryUsage();

      return reply.code(isHealthy ? 200 : 503).send({
        status: isHealthy ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        services: {
          redis: redisOk ? 'ok' : 'error',
          db: dbOk ? 'ok' : 'error',
          queue: queueReady ? 'ok' : 'error',
        },
        queueState: { ready: queueReady, paused: litePaused || hardPaused },
        db_pool: {
          total: pool.totalCount,
          waiting: pool.waitingCount,
        },
        metrics: {
          ram_rss_mb: Math.round(memory.rss / 1024 / 1024),
          cpu_load_1m: Number(os.loadavg()[0].toFixed(2)),
          uptime_s: Math.floor(process.uptime()),
        },
      });
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);

      return reply.code(503).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'timeout',
        timestamp: new Date().toISOString(),
      });
    }
  });
}
