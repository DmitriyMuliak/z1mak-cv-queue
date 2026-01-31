import { env } from '../config/env';
import { cronService } from '../cron';
import { syncUserLimitsFromDB } from '../services/userLimitsPreloader';
import { buildApp } from './app';

export const start = async () => {
  try {
    const app = await buildApp({ logger: true }, { syncUserLimitsFromDB, cronService });

    await app.listen({ port: env.port, host: '0.0.0.0' });

    app.log.info(`Server running on port ${env.port}`);
  } catch (err) {
    console.error('Start app failed', err);
    process.exit(1);
  }
};
