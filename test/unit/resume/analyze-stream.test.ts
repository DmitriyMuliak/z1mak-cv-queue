import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import resumeRoutes from '../../../src/routes/resume/resume';
import { ResumeTestDriver } from '../../helpers/ResumeTestDriver';
import { RedisBehavioralDriver } from '../../helpers/RedisBehavioralDriver';

// Mock dependencies
vi.mock('../../../src/db/client', () => ({
  db: { withUserContext: vi.fn() },
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

describe('Resume Analyze Routes (Behavioral with ioredis-mock)', () => {
  let fastify: any;
  let redisDriver: RedisBehavioralDriver;
  let driver: ResumeTestDriver;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test');
    redisDriver = new RedisBehavioralDriver();

    fastify = Fastify();
    fastify.decorate('redis', redisDriver.instance);
    fastify.decorate('authenticate', async (request: any) => {
      request.user = { sub: 'u1', app_metadata: { role: 'user' } };
    });
    fastify.decorate('queueLite', {});
    fastify.decorate('queueHard', {});

    await fastify.register(resumeRoutes, { prefix: '/resume' });
    driver = new ResumeTestDriver(fastify);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fastify.close();
  });

  it('Scenario: Submit job for streaming', async () => {
    const payload = {
      payload: {
        cvDescription: '...',
        mode: { evaluationMode: 'general', domain: 'common', depth: 'standard' },
        locale: 'en',
      },
    };
    const result = await driver.submitResume(payload, true);
    expect(result.status).toBe(200);
    expect(result.body.jobId).toBeTruthy();
  });

  it('Scenario: Get stream result from existing Redis result (Finished)', async () => {
    const jobId = 'job-finished';
    await redisDriver.setupFinishedJob(jobId, { score: 100 });

    const { events } = await driver.getStream(jobId);

    expect(events).toEmitSnapshot({ content: { score: 100 } });
    expect(events).toCompleteSuccessfully();
  });
});
