import fp from 'fastify-plugin';
import { db } from '../db/client';
import { onShutdown, ShutdownPriority } from '../utils/shutdownEmitter';

export default fp(async (fastify) => {
  fastify.decorate('db', db);

  let closed = false;
  const closeDb = async () => {
    if (closed) return;
    closed = true;

    try {
      await db.end();
    } catch (err) {
      fastify.log.error(err, 'db end failed');
    }
  };

  onShutdown(closeDb, ShutdownPriority.DATABASE);
});
