import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin;
    if (origin) {
      reply.code(403).send({
        ok: false,
        error: 'CORS_FORBIDDEN',
        message: 'This service is not accessible from browsers.',
      });
    }
  });
});
