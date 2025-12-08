import Fastify from 'fastify';
import corsDeny from './plugins/corsDeny';
import internalAuth from './plugins/internalAuth';
import redisPlugin from './plugins/redis';
import jobsRoutes from './routes/jobs';
import healthRoutes from './routes/health';
import { env } from './config/env';
import { syncUserLimitsFromDB } from './services/userLimitsPreloader';
import { startCron, stopCron } from './cron';

const start = async () => {
  const fastify = Fastify({ logger: true });

  await fastify.register(corsDeny);
  await fastify.register(internalAuth);
  await fastify.register(redisPlugin);

  await fastify.register(jobsRoutes);
  await fastify.register(healthRoutes);

  try {
    await fastify.ready();

    await syncUserLimitsFromDB(fastify.redis).catch((err) => {
      fastify.log.error(err, 'syncUserLimitsFromDB');
    });
  
    await startCron();

    await fastify.listen({ port: env.port, host: '0.0.0.0' });

    const shutdown = async () => {
      await stopCron(); 
      await fastify.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    fastify.log.info(`Server running on port ${env.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

void start();
