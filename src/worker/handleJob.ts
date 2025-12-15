import type { Job } from 'bullmq';
import { redisKeys } from '../redis/keys';
import type { RedisWithScripts } from '../redis/client';
import type { JobPayload } from './types';
import type { ModeType } from './concurrencyManager';
import type { ProviderResult } from './types';

type ConsumeLimitsIfNeeded = (
  job: Job<JobPayload>,
  tokensAlreadyConsumed: boolean
) => Promise<'delayed' | 'consumed' | 'skipped'>;

type MarkInProgress = (jobId: string) => Promise<void>;
type ExecuteModel = (job: Job<JobPayload>) => Promise<ProviderResult>;
type FinalizeSuccess = (job: Job<JobPayload>, result: ProviderResult) => Promise<void>;
type FinalizeFailure = (err: any) => never;

export const createHandleJob = (deps: {
  redis: RedisWithScripts;
  markInProgress: MarkInProgress;
  consumeLimitsIfNeeded: ConsumeLimitsIfNeeded;
  executeModel: ExecuteModel;
  finalizeSuccess: FinalizeSuccess;
  finalizeFailure: FinalizeFailure;
}) => {
  const { redis, markInProgress, consumeLimitsIfNeeded, executeModel, finalizeSuccess, finalizeFailure } =
    deps;

  return async (_queueType: ModeType, job: Job<JobPayload>) => {
    const jobId = job.id as string;
    const existingMeta = await redis.hgetall(redisKeys.jobMeta(jobId));
    const tokensAlreadyConsumed = existingMeta.tokens_consumed === 'true';

    await markInProgress(jobId);

    const startedAt = Date.now();
    try {
      const consumeResult = await consumeLimitsIfNeeded(job, tokensAlreadyConsumed);
      if (consumeResult === 'delayed') return;

      // Mark that we have reached the provider; helps avoid returning tokens if the worker crashes after provider call
      await redis.hset(redisKeys.jobMeta(jobId), { provider_completed: 'false' });

      const result = await executeModel(job);

      await redis.hset(redisKeys.jobMeta(jobId), { provider_completed: 'true' });

      await finalizeSuccess(job, result);
    } catch (err: any) {
      finalizeFailure(err);
    } finally {
      const durationMs = Date.now() - startedAt;
      console.info(`[Worker] job ${jobId} finished in ${durationMs}ms`);
    }
  };
};
