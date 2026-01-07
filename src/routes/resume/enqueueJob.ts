import type { Queue } from 'bullmq';
import { redisKeys } from '../../redis/keys';
import type { RedisWithScripts } from '../../redis/client';
import type { ModeType } from '../../types/mode';
import type { RunAiJobBody } from './schema';
import { JOB_KEY_TTL_SECONDS } from '../../constants/jobKeys';

type EnqueueArgs = {
  queue: Queue;
  redis: RedisWithScripts;
  waitingKey: string;
  jobId: string;
  requestedModel: string;
  selectedModel: string;
  body: RunAiJobBody;
  modeType: ModeType;
  createdAtMs: number;
};

export const enqueueJob = async ({
  queue,
  redis,
  waitingKey,
  jobId,
  requestedModel,
  selectedModel,
  body,
  modeType,
  createdAtMs,
}: EnqueueArgs) => {
  try {
    const metaKey = redisKeys.jobMeta(jobId);
    await Promise.all([
      queue.add(
        'ai-job',
        {
          jobId,
          userId: body.userId,
          requestedModel,
          model: selectedModel,
          payload: body.payload,
          role: body.role,
          modeType,
        },
        { jobId }
      ),
      redis
        .multi()
        .hset(metaKey, {
          user_id: body.userId,
          requested_model: requestedModel,
          processed_model: selectedModel,
          created_at: new Date(createdAtMs).toISOString(),
          status: 'queued',
          attempts: 0,
          mode_type: modeType,
        })
        .expire(metaKey, JOB_KEY_TTL_SECONDS)
        .exec(),
    ]);
  } catch (err) {
    await redis.decr(waitingKey);
    throw err;
  }
};
