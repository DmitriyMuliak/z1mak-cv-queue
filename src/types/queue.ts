import type { Queue } from 'bullmq';
import type { RedisJobResultHash } from '../redis/keys.types';
import type { RunAiJobBody } from '../routes/resume/schema';
import type { ModeType } from './mode';

type AiJobName = 'ai-job';

type AiJobData = {
  jobId: string;
  userId: string;
  requestedModel: string;
  model: string;
  payload: RunAiJobBody['payload'];
  role: 'user' | 'admin';
  modeType: ModeType;
};

export type QueueType = Queue<AiJobData, RedisJobResultHash, AiJobName>;
