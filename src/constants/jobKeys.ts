export const JOB_KEY_TTL_SECONDS = 24 * 60 * 60; // keep job meta/result for 24h before cleanup
// Allow long queueing (e.g., up to ~30 minutes of backlog) before declaring result missing
export const MISSING_RESULT_GRACE_MS = 35 * 60 * 1000; // 35 minutes

export const STREAM_TTL_SAFETY = 900; // 15 minutes for active streams
export const STREAM_TTL_COMPLETED = 300; // 5 minutes after completion
