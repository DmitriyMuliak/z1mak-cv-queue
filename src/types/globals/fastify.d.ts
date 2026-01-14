import { db } from '../../db/client';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    db: typeof db;
    redis: Redis;
  }
}
