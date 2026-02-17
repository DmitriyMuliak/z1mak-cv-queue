export const redisChannels = {
  configUpdate: 'config:update',
  jobStream: (jobId: string) => `job:stream:${jobId}`,
};
