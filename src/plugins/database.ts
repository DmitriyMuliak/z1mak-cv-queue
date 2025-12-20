import fp from 'fastify-plugin';
import { db } from '../db/client';

export default fp(async (fastify) => {
  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await db.end();
  });
});