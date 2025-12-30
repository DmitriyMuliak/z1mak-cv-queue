import { UnrecoverableError, Job } from 'bullmq';
import { redisKeys } from '../redis/keys';
import { ConsumeCode } from '../types/queueCodes';
import type { RedisWithScripts } from '../redis/client';
import type { JobPayload } from './types';

type ConsumeModelLimits = (
  model: string,
  limits: { modelRpm: number; modelRpd: number }
) => Promise<number>;

export const createConsumeLimitsIfNeeded = (deps: {
  redis: RedisWithScripts;
  consumeModelLimits: ConsumeModelLimits;
}) => {
  const { redis, consumeModelLimits } = deps;

  return async (
    job: Job<JobPayload>,
    tokensAlreadyConsumed: boolean
  ): Promise<'delayed' | 'consumed' | 'skipped'> => {
    if (tokensAlreadyConsumed) return 'skipped';

    const jobId = job.id as string;
    const { model } = job.data;

    const modelLimits = await redis.hgetall(redisKeys.modelLimits(model));
    const modelRpmLimit = Number(modelLimits?.rpm ?? 0);
    const modelRpdLimit = Number(modelLimits?.rpd ?? 0);

    const consumeCode = await consumeModelLimits(model, {
      modelRpm: modelRpmLimit,
      modelRpd: modelRpdLimit,
    });

    if (consumeCode === ConsumeCode.ModelRpmExceeded) {
      const ttl = await redis.ttl(redisKeys.modelRpm(model));
      const delayMs = Math.max(ttl, 1) * 1000;
      await redis.hset(redisKeys.jobMeta(jobId), { status: 'queued' });
      await job.moveToDelayed(Date.now() + delayMs, job.token);
      return 'delayed';
    }

    if (consumeCode === ConsumeCode.ModelRpdExceeded) {
      throw new UnrecoverableError('MODEL_RPD_EXCEEDED');
    }

    if (consumeCode === ConsumeCode.UserRpdExceeded) {
      throw new UnrecoverableError('USER_RPD_EXCEEDED');
    }

    await redis.hset(redisKeys.jobMeta(jobId), { tokens_consumed: 'true' });
    return 'consumed';
  };
};
