import type { ModelProviderService } from '../ai/ModelProviderService';
import { UnrecoverableError, type Job } from 'bullmq';
import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';
import { redisChannels } from '../redis/channels';
import type { JobPayload, ProviderResult } from './types';

export const createExecuteModel = (
  modelProvider: ModelProviderService,
  redis: RedisWithScripts
) => {
  return async (job: Job<JobPayload>): Promise<ProviderResult> => {
    const { model, payload, streaming } = job.data;
    const jobId = job.id as string;
    const apiName = await redis.hget(redisKeys.modelLimits(model), 'api_name');

    if (!apiName) {
      throw new UnrecoverableError(`MODEL_API_NAME_MISSING:${model}`);
    }

    const input = {
      model: apiName,
      cvDescription: payload.cvDescription,
      jobDescription: payload.jobDescription,
      mode: payload.mode,
      locale: payload.locale,
    };

    if (!streaming) {
      return modelProvider.execute(input) as Promise<ProviderResult>;
    }

    const channel = redisChannels.jobStream(jobId);
    let fullText = '';
    try {
      const stream = modelProvider.executeStream(input);
      for await (const chunk of stream) {
        fullText += chunk;
        await redis.publish(channel, JSON.stringify({ type: 'chunk', data: chunk }));
      }

      await redis.publish(channel, JSON.stringify({ type: 'done' }));

      return { text: fullText, usedModel: model };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as Record<string, any>)?.code || 'UNKNOWN_ERROR';

      await redis.publish(
        channel,
        JSON.stringify({
          type: 'error',
          code: errorCode,
          message: errorMessage,
        })
      );
      throw error;
    }
  };
};
