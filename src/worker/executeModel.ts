import type { ModelProviderService } from '../ai/ModelProviderService';
import type { Job } from 'bullmq';
import type { JobPayload, ProviderResult } from './types';

export const createExecuteModel = (modelProvider: ModelProviderService) => {
  return async (job: Job<JobPayload>): Promise<ProviderResult> => {
    const { model, payload } = job.data;
    return modelProvider.execute({
      model,
      cvDescription: payload.cvDescription,
      jobDescription: payload.jobDescription,
      mode: payload.mode,
      locale: payload.locale,
    }) as Promise<ProviderResult>;
  };
};
