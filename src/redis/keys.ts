export const redisKeys = {
  modelLimits: (name: string) => `model:${name}:limits`,
  modelIds: () => 'models:ids',
  modelRpm: (name: string) => `model:${name}:rpm`,
  modelRpd: (name: string) => `model:${name}:rpd`,
  userTypeRpd: (userId: string, type: 'hard' | 'lite', date: string) =>
    `user:${userId}:rpd:${type}:${date}`,
  userActiveJobs: (userId: string) => `user:${userId}:active_jobs`,
  jobMeta: (jobId: string) => `job:${jobId}:meta`,
  jobResult: (jobId: string) => `job:${jobId}:result`,
  userLimits: (userId: string) => `user:${userId}:limits`,
  queueWaitingModel: (model: string) => `queue:waiting:${model}`,
  workerConcurrency: (type: 'hard' | 'lite') => `config:worker:${type}:concurrency`,
};
