import type { RedisWithScripts } from '../../redis/client';

export const scanKeys = async (
  redis: RedisWithScripts,
  pattern: string,
  count = 500
): Promise<string[]> => {
  let cursor = '0';
  const keys: string[] = [];
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = next;
    if (batch.length) keys.push(...batch);
  } while (cursor !== '0');
  return keys;
};
