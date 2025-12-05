export const redisKeys = {
  modelLimits: (name: string) => `model:${name}:limits`,
  modelDaily: (name: string, date: string) => `model:${name}:daily:${date}`,
  modelRpm: (name: string) => `model:${name}:rpm`,
  modelRpd: (name: string) => `model:${name}:rpd`,
  userModelRpm: (userId: string, model: string) =>
    `user:${userId}:model:${model}:rpm`,
  userModelRpd: (userId: string, model: string) =>
    `user:${userId}:model:${model}:rpd_zset`,
  userActiveJobs: (userId: string) => `user:${userId}:active_jobs`,
  userDailyRpd: (userId: string, date: string) => `user:${userId}:daily:${date}`,
  jobMeta: (jobId: string) => `job:${jobId}:meta`,
  jobResult: (jobId: string) => `job:${jobId}:result`,
  userLimits: (userId: string) => `user:${userId}:limits`,
};
