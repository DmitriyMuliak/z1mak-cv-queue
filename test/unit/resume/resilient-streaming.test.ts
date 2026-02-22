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

describe('Resilient Streaming Logic (RFC-002)', () => {
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

  it('Adaptive Polling: sends queued status and closes immediately if job is in queue', async () => {
    const jobId = 'job-queued';
    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === redisKeys.jobMeta(jobId)) {
        return { status: 'queued', streaming: 'true' };
      }
      return {};
    });
    mockRedis.exists.mockResolvedValue(0);

    const response = await fastify.inject({
      method: 'POST',
      url: `/resume/${jobId}/result-stream`,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('event: snapshot');
    expect(response.body).toContain('"status":"queued"');
  });

  it('Snapshot Consolidation: merges multiple chunks into one snapshot', async () => {
    const jobId = 'job-processing';
    const streamKey = redisKeys.jobStream(jobId);

    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === redisKeys.jobMeta(jobId))
        return { status: 'processing', streaming: 'true' };
      return {};
    });
    mockRedis.exists.mockResolvedValueOnce(1).mockResolvedValue(0);

    mockRedis.xread.mockResolvedValueOnce([
      [
        streamKey,
        [
          ['1-0', ['data', JSON.stringify({ type: 'chunk', data: 'Part 1' })]],
          ['1-1', ['data', JSON.stringify({ type: 'chunk', data: 'Part 2' })]],
        ],
      ],
    ]);

    const response = await fastify.inject({
      method: 'POST',
      url: `/resume/${jobId}/result-stream`,
      payload: { lastEventId: '' },
    });

    expect(response.body).toContain('event: snapshot');
    expect(response.body).toContain('Part 1Part 2');
  });

  it('Delta Resumption: sends only missed chunks', async () => {
    const jobId = 'job-processing';
    const streamKey = redisKeys.jobStream(jobId);

    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === redisKeys.jobMeta(jobId))
        return { status: 'processing', streaming: 'true' };
      return {};
    });
    mockRedis.exists.mockResolvedValueOnce(1).mockResolvedValue(0);

    mockRedis.xread.mockResolvedValueOnce([
      [
        streamKey,
        [['1-4', ['data', JSON.stringify({ type: 'chunk', data: 'Missed Chunk' })]]],
      ],
    ]);

    const response = await fastify.inject({
      method: 'POST',
      url: `/resume/${jobId}/result-stream`,
      payload: { lastEventId: '1-3' },
    });

    expect(response.body).toContain('event: chunk');
    expect(response.body).toContain('Missed Chunk');
    expect(response.body).not.toContain('event: snapshot');
  });

  it('Database Fallback: retrieves result from DB if Redis is empty', async () => {
    const jobId = 'job-old';
    const { db } = await import('../../../src/db/client');

    mockRedis.hgetall.mockResolvedValue({});
    mockRedis.exists.mockResolvedValue(0);

    (db.withUserContext as any).mockImplementation(async (_user: any, cb: any) => {
      return cb({
        query: vi.fn().mockResolvedValue({
          rows: [{ status: 'completed', result: { summary: 'from-db' }, error: null }],
        }),
      });
    });

    const response = await fastify.inject({
      method: 'POST',
      url: `/resume/${jobId}/result-stream`,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('event: snapshot');
    expect(response.body).toContain('from-db');
  });

  it('Zombie Prevention: closes connection if stream key disappears', async () => {
    const jobId = 'job-live';
    const streamKey = redisKeys.jobStream(jobId);

    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === redisKeys.jobMeta(jobId))
        return { status: 'processing', streaming: 'true' };
      return {};
    });

    mockRedis.xread.mockResolvedValue(null);

    // Simulate TTL expiry: key exists on the first check, but disappears during the loop
    let existsCallCount = 0;
    mockRedis.exists.mockImplementation((key: string) => {
      if (key === streamKey) {
        return existsCallCount++ === 0 ? 1 : 0;
      }
      return 1;
    });

    const response = await fastify.inject({
      method: 'POST',
      url: `/resume/${jobId}/result-stream`,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    // The test passes if the inject call finishes, meaning reply.raw.end() was called
  });

  it('Race Condition: handles job completion during connect', async () => {
    const jobId = 'job-finishing';
    const streamKey = redisKeys.jobStream(jobId);

    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === redisKeys.jobMeta(jobId))
        return { status: 'processing', streaming: 'true' };
      return {};
    });
    mockRedis.exists.mockResolvedValueOnce(1).mockResolvedValue(0);

    mockRedis.xread.mockResolvedValueOnce([
      [
        streamKey,
        [
          ['1-0', ['data', JSON.stringify({ type: 'chunk', data: 'Final text' })]],
          ['1-1', ['data', JSON.stringify({ type: 'done' })]],
        ],
      ],
    ]);

    const response = await fastify.inject({
      method: 'POST',
      url: `/resume/${jobId}/result-stream`,
      payload: {},
    });

    expect(response.body).toContain('event: snapshot');
    expect(response.body).toContain('"status":"completed"');
  });

  it('Invalid lastEventId: handles errors gracefully with SSE event', async () => {
    const jobId = 'job-live';
    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === redisKeys.jobMeta(jobId))
        return { status: 'processing', streaming: 'true' };
      return {};
    });
    mockRedis.exists.mockResolvedValue(1);
    mockRedis.xread.mockRejectedValue(new Error('ERR Invalid stream ID'));

    const response = await fastify.inject({
      method: 'POST',
      url: `/resume/${jobId}/result-stream`,
      payload: { lastEventId: 'invalid-garbage' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('event: error');
    expect(response.body).toContain('SERVER_ERROR');
  });
});
