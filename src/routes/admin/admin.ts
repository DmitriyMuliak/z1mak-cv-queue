import { FastifyInstance } from 'fastify';
import { redisKeys } from '../../redis/keys';
import { redisChannels } from '../../redis/channels';
import { createReloadModelLimits } from '../../cron/reloadModelLimits';
import { WorkerConcurrencyBody, WorkerConcurrencySchema } from './schema';

export default async function adminRoutes(fastify: FastifyInstance) {
  const reloadModelLimits = createReloadModelLimits({
    redis: fastify.redis,
    db: fastify.db,
  });

  fastify.post<{ Body: WorkerConcurrencyBody }>(
    '/admin/worker-concurrency',
    { schema: { body: WorkerConcurrencySchema } },
    async (request) => {
      const { queue, concurrency } = request.body;

      await fastify.redis.set(redisKeys.workerConcurrency(queue), concurrency);
      await fastify.redis.publish(redisChannels.configUpdate, JSON.stringify({ queue }));

      return { ok: true, queue, concurrency };
    }
  );

  fastify.post('/admin/update-models-limits', async () => {
    await reloadModelLimits();
    return { ok: true };
  });
}
