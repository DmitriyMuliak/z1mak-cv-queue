import type { ModelProviderService } from '../ai/ModelProviderService';
import { UnrecoverableError, type Job } from 'bullmq';
import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';
import { STREAM_TTL_SAFETY, STREAM_TTL_COMPLETED } from '../constants/jobKeys';
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

    const streamKey = redisKeys.jobStream(jobId);
    let fullText = '';
    let isFirstChunk = true;

    try {
      const stream = modelProvider.executeStream(input);
      for await (const chunk of stream) {
        fullText += chunk;
        const message = JSON.stringify({ type: 'chunk', data: chunk });
        await redis.xadd(streamKey, '*', 'data', message);

        if (isFirstChunk) {
          await redis.expire(streamKey, STREAM_TTL_SAFETY);
          isFirstChunk = false;
        }
      }

      await redis.xadd(streamKey, '*', 'data', JSON.stringify({ type: 'done' }));
      await redis.expire(streamKey, STREAM_TTL_COMPLETED);

      return { text: fullText, usedModel: model };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as Record<string, any>)?.code || 'UNKNOWN_ERROR';

      const errorMsg = JSON.stringify({
        type: 'error',
        code: errorCode,
        message: errorMessage,
      });

      await redis.xadd(streamKey, '*', 'data', errorMsg);
      await redis.expire(streamKey, STREAM_TTL_COMPLETED);

      throw error;
    }
  };
};
