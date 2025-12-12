import { FastifyInstance } from 'fastify';
import { redisKeys } from '../redis/keys';
import { redisChannels } from '../redis/channels';

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.post('/admin/worker-concurrency', async (request, reply) => {
    const body = request.body as { queue?: 'lite' | 'hard'; concurrency?: number };

    if (!body?.queue || (body.queue !== 'lite' && body.queue !== 'hard')) {
      return reply.status(400).send({ ok: false, error: 'INVALID_QUEUE' });
    }

    const value = Number(body.concurrency);
    if (!Number.isFinite(value) || value <= 0) {
      return reply.status(400).send({ ok: false, error: 'INVALID_CONCURRENCY' });
    }

    await fastify.redis.set(redisKeys.workerConcurrency(body.queue), value);
    await fastify.redis.publish(redisChannels.configUpdate, JSON.stringify({ queue: body.queue }));

    return { ok: true, queue: body.queue, concurrency: value };
  });
}
