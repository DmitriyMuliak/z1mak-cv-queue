import { Worker, type Job } from 'bullmq';
import type { JobPayload, ModeType } from './types';

type HandleJob = (queueType: ModeType, job: Job<JobPayload>) => Promise<void>;

type CreateWorkerFactoryDeps = {
  queueNames: Record<ModeType, string>;
  redisUrl: string;
  handleJob: HandleJob;
};

export const createWorkerFactory = ({
  queueNames,
  redisUrl,
  handleJob,
}: CreateWorkerFactoryDeps) => {
  const stalledMs = 60_000; // must exceed expected job duration
  return (queueType: ModeType, concurrency: number) =>
    new Worker(
      queueNames[queueType],
      async (job) => {
        await handleJob(queueType, job as Job<JobPayload>);
      },
      {
        connection: { url: redisUrl },
        concurrency,
        stalledInterval: stalledMs,
        lockDuration: stalledMs,
        maxStalledCount: 1,
      }
    );
};
