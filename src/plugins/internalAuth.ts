import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env';

export default fp(async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === '/health') {
      return;
    }

    if (!env.internalApiKey) {
      return reply.status(500).send({ ok: false, error: 'SERVER_MISCONFIGURED' });
    }

    const headerKey = request.headers['x-internal-api-key'] as string;

    if (!headerKey || headerKey !== env.internalApiKey) {
      return reply.status(401).send({
        ok: false,
        error: 'UNAUTHORIZED_INTERNAL_REQUEST',
      });
    }
  });
});
