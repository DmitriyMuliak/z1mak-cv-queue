// Type definitions for values stored in Redis using helpers from redisKeys.

export type RedisModeType = 'hard' | 'lite';
export type RedisJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed';
export type RedisJobResultStatus = 'completed' | 'failed';

export interface RedisModelLimitsHash {
  rpm: string; // numeric string
  rpd: string; // numeric string
  updated_at?: string;
}

export interface RedisUserLimitsHash {
  role: 'user' | 'admin';
  hard_rpd: string; // numeric string or empty
  lite_rpd: string; // numeric string or empty
  max_concurrency: string; // numeric string or empty
  unlimited: 'true' | 'false';
}

export interface RedisJobMetaHash {
  user_id: string;
  resume_id?: string | null;
  requested_model: string;
  processed_model?: string;
  created_at: string;
  updated_at?: string;
  status: RedisJobStatus;
  attempts?: string;
  mode_type?: RedisModeType;
  tokens_consumed?: 'true';
  provider_completed?: 'true' | 'false';
}

export interface RedisJobResultHash {
  status: RedisJobResultStatus;
  data?: string;
  error?: string;
  error_code?: string;
  finished_at?: string;
  used_model?: string;
  expired_at?: string;
}

export type RedisCounterValue = number;
export type RedisUserActiveJobs = string[]; // ZSET of job ids for concurrency locks

export interface RedisKeyTypeMap {
  modelLimits: RedisModelLimitsHash;
  modelRpm: RedisCounterValue;
  modelRpd: RedisCounterValue;
  userTypeRpd: RedisCounterValue;
  userActiveJobs: RedisUserActiveJobs;
  jobMeta: RedisJobMetaHash;
  jobResult: RedisJobResultHash;
  userLimits: RedisUserLimitsHash;
  queueWaitingModel: RedisCounterValue;
  workerConcurrency: string;
}
