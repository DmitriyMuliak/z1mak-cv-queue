import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { stopCron } from '../cron';
import { onShutdown, ShutdownPriority, triggerShutdown } from '../utils/shutdownEmitter';

export default fp(async (fastify: FastifyInstance) => {
  let isShuttingDown = false;
  const stopCronHandler = async () => {
    try {
      await stopCron();
    } catch (err) {
      fastify.log.error(err, 'stopCron failed');
    }
  };

  onShutdown(stopCronHandler, ShutdownPriority.CRON);

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
