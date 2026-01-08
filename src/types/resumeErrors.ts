export type ResumeErrorCode =
  | 'QUEUE_FULL' // /resume/analyze: черга переповнена для моделі
  | 'CONCURRENCY_LIMIT' // /resume/analyze: user concurrency з Lua
  | 'USER_RPD_LIMIT' // /resume/analyze: user RPD з Lua
  | 'MODEL_LIMIT' // /resume/analyze: усі моделі в chain по RPD
  | 'NOT_FOUND'; // /resume/:id/result, /resume/:id/status

export type ResumeErrorResponse = {
  ok: false;
  error: ResumeErrorCode;
  message?: string; // використовується зараз лише для QUEUE_FULL
};
