export const userLimitError = {
  USER_RPD_LIMIT: 'USER_RPD_LIMIT',
  CONCURRENCY_LIMIT: 'CONCURRENCY_LIMIT',
} as const;

export const modelLimitError = {
  MODEL_RPD_LIMIT: 'MODEL_RPD_LIMIT',
  MODEL_LIMIT: 'MODEL_LIMIT',
} as const;

export const queueLimitError = {
  QUEUE_FULL: 'QUEUE_FULL',
} as const;

export const limitError = {
  ...userLimitError,
  ...modelLimitError,
  ...queueLimitError,
} as const;

export const exceededError = {
  MODEL_RPD_EXCEEDED: 'MODEL_RPD_EXCEEDED',
  MODEL_RPM_EXCEEDED: 'MODEL_RPM_EXCEEDED',
  USER_RPD_EXCEEDED: 'USER_RPD_EXCEEDED',
} as const;
