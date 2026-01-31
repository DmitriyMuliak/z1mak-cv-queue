import Fastify, { FastifyServerOptions } from 'fastify';
import corsDenyPlugin from '../plugins/corsDeny';
import internalAuthPlugin from '../plugins/internalAuth';
import redisPlugin from '../plugins/redis';
import authPlugin from '../plugins/auth';
import dbPlugin from '../plugins/database';
import shutdownPlugin from '../plugins/shutdown';
import resumeRoutes from '../routes/resume/resume';
import healthRoutes from '../routes/health';
import adminRoutes from '../routes/admin/admin';
import type { SyncUserLimitsFromDB } from '../services/userLimitsPreloader';
import type { CronService } from '../cron';

export const buildApp = async (
  options: FastifyServerOptions,
  deps: {
    syncUserLimitsFromDB: SyncUserLimitsFromDB;
    cronService: CronService;
  }
) => {
  const fastify = Fastify(options);

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

    await deps.syncUserLimitsFromDB(fastify.redis).catch((err) => {
      fastify.log.error(err, 'syncUserLimitsFromDB');
      throw err;
    });

    await deps.cronService.start().catch((err) => {
      fastify.log.error(err, 'startCron');
      throw err;
    });

    return fastify;
  } catch (err) {
    fastify.log.error(new Error('buildApp', { cause: err }), 'Build app failed');
    throw err;
  }
};
