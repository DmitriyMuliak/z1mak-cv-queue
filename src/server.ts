import Fastify from 'fastify';
import corsDenyPlugin from './plugins/corsDeny';
import internalAuthPlugin from './plugins/internalAuth';
import redisPlugin from './plugins/redis';
import authPlugin from './plugins/auth';
import dbPlugin from './plugins/database';
import shutdownPlugin from './plugins/shutdown';
import resumeRoutes from './routes/resume/resume';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin/admin';
import { syncUserLimitsFromDB } from './services/userLimitsPreloader';
import { startCron } from './cron';
import { env } from './config/env';

const start = async () => {
  const fastify = Fastify({ logger: true });

  await fastify.register(dbPlugin);
  await fastify.register(corsDenyPlugin);
  await fastify.register(internalAuthPlugin);
  await fastify.register(authPlugin);
  await fastify.register(redisPlugin);
  await fastify.register(shutdownPlugin);

  await fastify.register(resumeRoutes, { prefix: '/resume' });
  await fastify.register(healthRoutes);
  await fastify.register(adminRoutes);

  try {
    await fastify.ready();

    await syncUserLimitsFromDB(fastify.redis).catch((err) => {
      fastify.log.error(err, 'syncUserLimitsFromDB');
    });

    await startCron();

    await fastify.listen({ port: env.port, host: '0.0.0.0' });

    fastify.log.info(`Server running on port ${env.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

void start();
