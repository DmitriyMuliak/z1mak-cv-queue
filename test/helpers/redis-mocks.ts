import { SSEEvent } from '../../src/utils/sse';

/**
 * Builds a mock Redis Stream history for xread calls.
 * Hides the complex nested array structure of ioredis responses.
 */
export const buildStreamHistory = (
  streamKey: string,
  entries: Array<{ id?: string; type: SSEEvent; data?: string | Record<string, any> }>
) => {
  const redisEntries = entries.map((entry, index) => {
    const id = entry.id || `1-${index}`;
    const payload =
      typeof entry.data === 'string'
        ? { type: entry.type, data: entry.data }
        : { type: entry.type, ...entry.data };

    return [id, ['data', JSON.stringify(payload)]];
  });

  return [[streamKey, redisEntries]];
};

/**
 * Builds a mock Redis HASH structure for job results.
 */
export const buildJobResult = (data: Record<string, any>, status = 'completed') => {
  return {
    status,
    data: JSON.stringify(data),
    finished_at: new Date().toISOString(),
  };
};
