import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import resumeRoutes from '../../../src/routes/resume/resume';
import { ResumeTestDriver } from '../../helpers/ResumeTestDriver';
import { RedisBehavioralDriver } from '../../helpers/RedisBehavioralDriver';
import { redisKeys } from '../../../src/redis/keys';

// Mock DB
vi.mock('../../../src/db/client', () => ({
  db: { withUserContext: vi.fn() },
}));

describe('Resilient Streaming Logic (Behavioral with ioredis-mock)', () => {
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

  it('Scenario: User connects to a queued job', async () => {
    const jobId = 'job-queued';
    await redisDriver.setupActiveJob(jobId, 'queued');

    const { events } = await driver.getStream(jobId);

    expect(events).toEmitSnapshot({ status: 'queued' });
  });

  it('Scenario: User resumes connection and gets consolidated snapshot', async () => {
    const jobId = 'job-history';
    await redisDriver.setupActiveJob(jobId, 'processing');
    await redisDriver.pushToStream(jobId, 'chunk', 'Hello ');
    await redisDriver.pushToStream(jobId, 'chunk', 'World');
    await redisDriver.pushToStream(jobId, 'done');

    const { events } = await driver.getStream(jobId);

    expect(events).toEmitSnapshot({ content: 'Hello World' });
    expect(events).toCompleteSuccessfully();
  });

  it('Scenario: Stream key expires while user is waiting', async () => {
    const jobId = 'job-zombie';
    const streamKey = redisKeys.jobStream(jobId);

    await redisDriver.setupActiveJob(jobId, 'processing');

    // We break the loop by making exists return 0 on the second loop check
    let existsCalls = 0;
    vi.spyOn(redisDriver.instance, 'exists').mockImplementation(async (key: any) => {
      if (key === streamKey) {
        // threshold 2 allows initial checks to pass and then breaks the loop
        return existsCalls++ < 2 ? 1 : 0;
      }
      return 0;
    });

    const { status } = await driver.getStream(jobId);
    expect(status).toBe(200);
  });

  it('Scenario: Redis is empty, fallback to Database', async () => {
    const jobId = 'job-db-fallback';
    const { db } = await import('../../../src/db/client');

    (db.withUserContext as any).mockImplementation(async (_user: any, cb: any) => {
      return cb({
        query: vi.fn().mockResolvedValue({
          rows: [{ status: 'completed', result: { text: 'db-val' }, error: null }],
        }),
      });
    });

    const { events } = await driver.getStream(jobId);

    expect(events).toEmitSnapshot({ content: { text: 'db-val' } });
  });
});
