import type { Queue } from 'bullmq';
import { redisKeys } from '../../redis/keys';
import type { RedisWithScripts } from '../../redis/client';
import type { ModeType } from '../../types/mode';
import type { RunAiJobBody } from './schema';

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
      redis.hset(redisKeys.jobMeta(jobId), {
        user_id: body.userId,
        requested_model: requestedModel,
        processed_model: selectedModel,
        created_at: new Date(createdAtMs).toISOString(),
        status: 'queued',
        attempts: 0,
        mode_type: modeType,
      }),
    ]);
  } catch (err) {
    await redis.decr(waitingKey);
    throw err;
  }
};
