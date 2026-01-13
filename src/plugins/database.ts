import fp from 'fastify-plugin';
import { db } from '../db/client';

export default fp(async (fastify) => {
  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    // todo: add waiting finish worker, close queues, finish cron jobs
    await db.end();
  });
});
