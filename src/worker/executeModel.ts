import type { ModelProviderService } from '../ai/ModelProviderService';
import { UnrecoverableError, type Job } from 'bullmq';
import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';
import type { JobPayload, ProviderResult } from './types';

export const createExecuteModel = (
  modelProvider: ModelProviderService,
  redis: RedisWithScripts
) => {
  return async (job: Job<JobPayload>): Promise<ProviderResult> => {
    const { model, payload } = job.data;
    const apiName = await redis.hget(redisKeys.modelLimits(model), 'api_name');
    if (!apiName) {
      throw new UnrecoverableError(`MODEL_API_NAME_MISSING:${model}`);
    }
    return modelProvider.execute({
      model: apiName,
      cvDescription: payload.cvDescription,
      jobDescription: payload.jobDescription,
      mode: payload.mode,
      locale: payload.locale,
    }) as Promise<ProviderResult>;
  };
};
