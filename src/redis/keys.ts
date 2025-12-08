export const redisKeys = {
  modelLimits: (name: string) => `model:${name}:limits`,
  modelRpm: (name: string) => `model:${name}:rpm`,
  modelRpd: (name: string) => `model:${name}:rpd`,
  userModelRpm: (userId: string, model: string) => `user:${userId}:model:${model}:rpm`,
  userModelRpd: (userId: string, model: string, date: string) =>
    `user:${userId}:model:${model}:rpd:${date}`,
  userActiveJobs: (userId: string) => `user:${userId}:active_jobs`,
  jobMeta: (jobId: string) => `job:${jobId}:meta`,
  jobResult: (jobId: string) => `job:${jobId}:result`,
  userLimits: (userId: string) => `user:${userId}:limits`,
};
