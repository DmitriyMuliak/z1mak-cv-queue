import { redisKeys } from '../redis/keys';
import type { RedisWithScripts } from '../redis/client';
import type { Job } from 'bullmq';
import type { JobPayload, ProviderResult } from './types';

export const createFinalizeSuccess = (redis: RedisWithScripts) => {
  return async (
    job: Job<JobPayload>,
    result: ProviderResult
  ) => {
    const { userId, model } = job.data;
    const jobId = job.id as string;
    const finishedAt = new Date().toISOString();
    const pipe = redis.pipeline();
    pipe.hset(redisKeys.jobMeta(jobId), {
      processed_model: result.usedModel,
      status: 'completed',
    });
    pipe.hset(redisKeys.jobResult(jobId), {
      status: 'completed',
      data: result.text,
      finished_at: finishedAt,
      used_model: result.usedModel,
    });
    pipe.zrem(redisKeys.userActiveJobs(userId), jobId);
    await pipe.exec();
    await redis.decrAndClampToZero([redisKeys.queueWaitingModel(model)]);
  };
};
