import { FastifyInstance } from 'fastify';
import { redisKeys } from '../../redis/keys';
import { redisChannels } from '../../redis/channels';
import { WorkerConcurrencyBody, WorkerConcurrencySchema } from './schema';

export default async function adminRoutes(fastify: FastifyInstance) {
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
}
