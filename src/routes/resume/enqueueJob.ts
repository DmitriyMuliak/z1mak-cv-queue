import { redisKeys } from '../../redis/keys';
import { JOB_KEY_TTL_SECONDS } from '../../constants/jobKeys';
import type { RedisWithScripts } from '../../redis/client';
import type { ModeType } from '../../types/mode';
import type { RunAiJobBody } from './schema';
import type { QueueType } from '../../types/queue';

type EnqueueArgs = {
  queue: QueueType;
  redis: RedisWithScripts;
  waitingKey: string;
  jobId: string;
  requestedModel: string;
  selectedModel: string;
  body: RunAiJobBody;
  userId: string;
  role: 'user' | 'admin';
  modeType: ModeType;
  createdAtMs: number;
  streaming?: boolean;
};

export const enqueueJob = async ({
  queue,
  redis,
  waitingKey,
  jobId,
  requestedModel,
  selectedModel,
  body,
  userId,
  role,
  modeType,
  createdAtMs,
  streaming = false,
}: EnqueueArgs) => {
  try {
    const metaKey = redisKeys.jobMeta(jobId);
    await Promise.all([
      queue.add(
        'ai-job',
        {
          jobId,
          userId,
          requestedModel,
          model: selectedModel,
          payload: body.payload,
          role,
          modeType,
          streaming,
        },
        { jobId }
      ),
      redis
        .multi()
        .hset(metaKey, {
          user_id: userId,
          requested_model: requestedModel,
          processed_model: selectedModel,
          created_at: new Date(createdAtMs).toISOString(),
          status: 'queued',
          attempts: 0,
          mode_type: modeType,
          streaming: String(streaming),
        })
        .expire(metaKey, JOB_KEY_TTL_SECONDS)
        .exec(),
    ]);
  } catch (err) {
    await redis.decr(waitingKey);
    throw err;
  }
};
