import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { stopCron } from '../cron';
import { triggerShutdown } from '../lifecycle/shutdownEmitter';

export default fp(async (fastify: FastifyInstance) => {
  let isShuttingDown = false;

  const shutdown = async (signal?: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    fastify.log.info({ signal }, 'shutdown requested');

    try {
      await fastify.close();
    } catch (err) {
      fastify.log.error(err, 'fastify close failed');
    }

    try {
      await stopCron();
    } catch (err) {
      fastify.log.error(err, 'stopCron failed');
    }

    try {
      await triggerShutdown();
    } catch (err) {
      fastify.log.error(err, 'shutdown handlers failed');
    }

    process.exit(0);
  };

  const handleSignal = (signal?: NodeJS.Signals) => {
    void shutdown(signal);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  fastify.addHook('onClose', async () => {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  });
});
