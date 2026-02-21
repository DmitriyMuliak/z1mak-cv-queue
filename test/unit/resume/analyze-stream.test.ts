import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import Fastify from 'fastify';
import resumeRoutes from '../../../src/routes/resume/resume';
import { redisKeys } from '../../../src/redis/keys';

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
  resolveModelChain: vi
    .fn()
    .mockResolvedValue({ requestedModel: 'm1', fallbackModels: [] }),
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

describe('Resume Streaming Routes', () => {
  let fastify: any;
  let mockRedis: any;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test');

    mockRedis = {
      incr: vi.fn().mockResolvedValue(1),
      decr: vi.fn().mockResolvedValue(0),
      hget: vi.fn().mockResolvedValue(null),
      hgetall: vi.fn().mockResolvedValue({}),
      xread: vi.fn().mockResolvedValue(null),
      exists: vi.fn().mockResolvedValue(0),
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

  describe('POST /resume/analyze', () => {
    it('returns a jobId and enqueues the job with streaming flag', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/resume/analyze',
        payload: {
          payload: {
            cvDescription: 'cv',
            mode: { evaluationMode: 'general', domain: 'common', depth: 'standard' },
            locale: 'en',
          },
          streaming: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobId).toBeTruthy();
    });
  });

  describe('POST /resume/:id/result-stream', () => {
    it('streams history from Redis Streams and sets SSE headers', async () => {
      const jobId = 'job-123';
      const streamKey = redisKeys.jobStream(jobId);

      // Mock XREAD returning history
      mockRedis.xread.mockImplementation((...args: any[]) => {
        if (args[0] === 'STREAMS' && args[1] === streamKey) {
          return [
            [
              streamKey,
              [
                ['1-0', ['data', JSON.stringify({ type: 'chunk', data: 'hello' })]],
                ['1-1', ['data', JSON.stringify({ type: 'done' })]],
              ],
            ],
          ];
        }
        return null;
      });

      // Mock Meta exists
      mockRedis.hgetall.mockImplementation((key: string) => {
        if (key === redisKeys.jobMeta(jobId))
          return { status: 'processing', streaming: 'true' };
        return {};
      });
      mockRedis.exists.mockResolvedValueOnce(1).mockResolvedValue(0);

      const response = await fastify.inject({
        method: 'POST',
        url: `/resume/${jobId}/result-stream`,
        payload: { lastEventId: '' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');

      const lines = response.body.split('\n');
      expect(lines).toContain(`id: 1-1`);
      expect(lines).toContain(`event: snapshot`);
      expect(
        JSON.parse(
          lines.find((l: string) => l.startsWith('data: '))?.substring(6) || '{}'
        )
      ).toEqual({
        content: 'hello',
        status: 'completed',
      });
    });

    it('returns finished result as snapshot if already in Redis', async () => {
      const jobId = 'job-123';
      mockRedis.hgetall.mockImplementation((key: string) => {
        if (key === redisKeys.jobResult(jobId)) {
          return { status: 'completed', data: JSON.stringify({ summary: 'ok' }) };
        }
        return {};
      });

      const response = await fastify.inject({
        method: 'POST',
        url: `/resume/${jobId}/result-stream`,
        payload: { lastEventId: '' },
      });

      expect(response.statusCode).toBe(200);
      const lines = response.body.split('\n');
      expect(lines).toContain('event: snapshot');
      expect(lines).toContain('event: done');
      expect(lines).toContain(`id: ${jobId}`);
    });
  });
});
