import { FakeRedis } from './Redis';
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
export const fakeRedis = new FakeRedis();

// Queue
export const createdQueues = createdQueuesInt;
export const createQueueMock = createQueueMockInt;

// Reset Logic
export const resetDoubles = () => {
  fakeRedis.reset();
  supabaseQueries.length = 0;
  createdQueues.forEach((q: any) => {
    q.getJobs = vi.fn(async () => []);
    q.close = vi.fn();
  });
};
