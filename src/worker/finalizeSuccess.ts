import { redisKeys } from '../redis/keys';
import type { RedisWithScripts } from '../redis/client';
import type { Job } from 'bullmq';
import type { JobPayload, ProviderResult } from './types';
import { JOB_KEY_TTL_SECONDS } from '../constants/jobKeys';

export const createFinalizeSuccess = (redis: RedisWithScripts) => {
  return async (job: Job<JobPayload>, result: ProviderResult) => {
    const { userId, model } = job.data;
    const jobId = job.id as string;
    const finishedAt = new Date().toISOString();
    const metaKey = redisKeys.jobMeta(jobId);
    const resultKey = redisKeys.jobResult(jobId);
    const pipe = redis.pipeline();
    pipe.hset(metaKey, {
      processed_model: result.usedModel,
      status: 'completed',
    });
    pipe.expire(metaKey, JOB_KEY_TTL_SECONDS);
    pipe.hset(resultKey, {
      status: 'completed',
      data: result.text,
      finished_at: finishedAt,
      used_model: result.usedModel,
    });
    pipe.expire(resultKey, JOB_KEY_TTL_SECONDS);
    pipe.zrem(redisKeys.userActiveJobs(userId), jobId);
    await pipe.exec();
    await redis.decrAndClampToZero([redisKeys.queueWaitingModel(model)]);
  };
};
