import Fastify from "fastify";
import corsDeny from "./plugins/corsDeny";
import internalAuth from "./plugins/internalAuth";
import redisPlugin from "./plugins/redis";
import jobsRoutes from "./routes/jobs";
import healthRoutes from "./routes/health";
import { env } from "./config/env";

const start = async () => {
  const fastify = Fastify({ logger: true });

  await fastify.register(corsDeny);
  await fastify.register(internalAuth);
  await fastify.register(redisPlugin);

  await fastify.register(jobsRoutes);
  await fastify.register(healthRoutes);

  try {
    await fastify.listen({ port: env.port, host: "0.0.0.0" });
    fastify.log.info(`Server running on port ${env.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

void start();
