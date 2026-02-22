import { RedisBehavioralDriver } from '../helpers/RedisBehavioralDriver';
import {
  createdQueues as createdQueuesInt,
  createQueueMock as createQueueMockInt,
} from './Queue';
import {
  supabaseQueries as supabaseQueriesInt,
  supabaseClientMock as supabaseClientMockInt,
} from './SupabaseClient';
import { vi } from 'vitest';

// DB
export const supabaseClientMock = supabaseClientMockInt;
export const supabaseQueries = supabaseQueriesInt;

// Redis
export const redisDriver = new RedisBehavioralDriver();
export const fakeRedis = redisDriver.instance;

// Queue
export const createdQueues = createdQueuesInt;
export const createQueueMock = createQueueMockInt;

// Reset Logic
export const resetDoubles = async () => {
  await redisDriver.instance.flushall();
  supabaseQueries.length = 0;
  createdQueues.forEach((q: any) => {
    q.getJobs = vi.fn(async () => []);
    q.close = vi.fn();
  });
};
