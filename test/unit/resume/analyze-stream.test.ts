import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import Fastify from 'fastify';
import resumeRoutes from '../../../src/routes/resume/resume';

// Mock dependencies
vi.mock('../../../src/db/client', () => ({
  db: {
    withUserContext: vi.fn(),
  },
}));
vi.mock('../../../src/services/limitsCache', () => ({
  getCachedUserLimits: vi.fn().mockResolvedValue({ role: 'user', unlimited: false }),
}));
vi.mock('../../../src/services/modelSelector', () => ({
  resolveModelChain: vi.fn().mockResolvedValue({ requestedModel: 'm1', fallbackModels: [] }),
}));
vi.mock('../../../src/routes/resume/modelSelection', () => ({
  selectAvailableModel: vi.fn().mockResolvedValue({
    status: 'ok',
    model: 'm1',
    modelRpm: 10,
    modelRpd: 100,
  }),
}));
vi.mock('../../../src/routes/resume/enqueueJob', () => ({
  enqueueJob: vi.fn().mockResolvedValue(undefined),
}));

describe('POST /resume/analyze-stream', () => {
  let fastify: any;
  let mockRedis: any;
  let mockSubscriber: any;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test');

    mockSubscriber = {
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };

    mockRedis = {
      incr: vi.fn().mockResolvedValue(1),
      decr: vi.fn().mockResolvedValue(0),
      duplicate: vi.fn().mockReturnValue(mockSubscriber),
      hget: vi.fn().mockResolvedValue(null),
      hgetall: vi.fn().mockResolvedValue({}),
    };

    fastify = Fastify();
    fastify.decorate('redis', mockRedis);
    fastify.decorate('authenticate', async (request: any) => {
      request.user = { sub: 'u1', app_metadata: { role: 'user' } };
    });
    fastify.decorate('queueLite', {});
    fastify.decorate('queueHard', {});

    await fastify.register(resumeRoutes, { prefix: '/resume' });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fastify.close();
  });

  it('sets correct headers and streams NDJSON from Redis Pub/Sub', async () => {
    let messageHandler: any;
    mockSubscriber.on.mockImplementation((event: string, handler: any) => {
      if (event === 'message') messageHandler = handler;
    });

    const responsePromise = fastify.inject({
      method: 'POST',
      url: '/resume/analyze-stream',
      payload: {
        payload: {
          cvDescription: 'cv',
          mode: { evaluationMode: 'general', domain: 'common', depth: 'standard' },
          locale: 'en',
        },
      },
    });

    // Wait for route to set up subscriber
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockSubscriber.subscribe).toHaveBeenCalled();
    const channel = mockSubscriber.subscribe.mock.calls[0][0];

    // Simulate messages from Redis
    messageHandler(channel, JSON.stringify({ type: 'chunk', data: 'hello' }));
    messageHandler(channel, JSON.stringify({ type: 'chunk', data: ' world' }));
    messageHandler(channel, JSON.stringify({ type: 'done' }));

    const response = await responsePromise;

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/x-ndjson');

    const lines = response.body.trim().split('\n');
    expect(lines.length).toBe(3);
    expect(JSON.parse(lines[0])).toEqual({ type: 'chunk', data: 'hello' });
    expect(JSON.parse(lines[1])).toEqual({ type: 'chunk', data: ' world' });
    expect(JSON.parse(lines[2])).toEqual({ type: 'done' });
  });

  it('stops streaming and cleans up on error message', async () => {
    let messageHandler: any;
    mockSubscriber.on.mockImplementation((event: string, handler: any) => {
      if (event === 'message') messageHandler = handler;
    });

    const responsePromise = fastify.inject({
      method: 'POST',
      url: '/resume/analyze-stream',
      payload: {
        payload: {
          cvDescription: 'cv',
          mode: { evaluationMode: 'general', domain: 'common', depth: 'standard' },
          locale: 'en',
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    const channel = mockSubscriber.subscribe.mock.calls[0][0];

    messageHandler(channel, JSON.stringify({ type: 'error', code: 'ERR', message: 'fail' }));

    const response = await responsePromise;
    const lines = response.body.trim().split('\n');
    expect(JSON.parse(lines[0])).toEqual({ type: 'error', code: 'ERR', message: 'fail' });
    expect(mockSubscriber.quit).toHaveBeenCalled();
  });
});
