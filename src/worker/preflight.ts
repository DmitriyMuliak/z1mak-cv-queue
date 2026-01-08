import type { RedisWithScripts } from '../redis/client';
import { redisKeys } from '../redis/keys';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 1_000;

const numberFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const missingApiNamesForIds = async (
  redis: RedisWithScripts,
  modelIds: string[]
): Promise<string[]> => {
  const pipeline = redis.pipeline();
  for (const modelId of modelIds) {
    pipeline.hgetall(redisKeys.modelLimits(modelId));
  }
  const results = await pipeline.exec();
  if (!results) return [...modelIds];

  const missing: string[] = [];
  for (let i = 0; i < modelIds.length; i++) {
    const hash = results[i]?.[1] as Record<string, string> | null | undefined;
    if (!hash || !hash.api_name) {
      missing.push(modelIds[i]);
    }
  }
  return missing;
};

export const waitForModelLimits = async (redis: RedisWithScripts) => {
  const timeoutMs = numberFromEnv(
    process.env.MODEL_PREFLIGHT_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const intervalMs = numberFromEnv(
    process.env.MODEL_PREFLIGHT_INTERVAL_MS,
    DEFAULT_INTERVAL_MS
  );
  const started = Date.now();

  console.info('[Worker] Waiting for model limits to be loaded into Redis.');

  while (Date.now() - started < timeoutMs) {
    const modelIds = await redis.smembers(redisKeys.modelIds());
    if (modelIds.length === 0) {
      console.warn('[Worker] Model list not ready. Retrying...');
      await sleep(intervalMs);
      continue;
    }

    const missing = await missingApiNamesForIds(redis, modelIds);
    if (missing.length === 0) {
      console.info('[Worker] Completed load model limits into Redis.');
      return;
    }
    console.warn(
      `[Worker] Missing api_name for models: ${missing.join(', ')}. Retrying...`
    );

    await sleep(intervalMs);
  }

  throw new Error(
    `[Worker] Model limits not ready after ${timeoutMs}ms. Check reloadModelLimits.`
  );
};
