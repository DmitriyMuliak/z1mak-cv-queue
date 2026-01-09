import { redisKeys } from '../redis/keys';
import { isHardMode } from '../utils/mode';
import type { RedisWithScripts } from '../redis/client';
import type { aiModelIds } from '../types/ai-models';
import type { Mode } from '../types/mode';

export interface ModelChain {
  requestedModel: aiModelIds;
  fallbackModels: aiModelIds[];
}

type ModelMeta = {
  id: aiModelIds;
  type: 'hard' | 'lite';
  fallbackPriority: number;
};

type ModelsByType = {
  hard: aiModelIds[];
  lite: aiModelIds[];
};

const sortByFallbackPriority = (a: ModelMeta, b: ModelMeta) =>
  a.fallbackPriority - b.fallbackPriority;

export const loadModelsByType = async (
  redis: RedisWithScripts
): Promise<ModelsByType> => {
  const modelIds = await redis.smembers(redisKeys.modelIds());
  if (modelIds.length === 0) {
    return { hard: [], lite: [] };
  }

  const pipeline = redis.pipeline();
  for (const id of modelIds) {
    pipeline.hgetall(redisKeys.modelLimits(id));
  }

  const results = await pipeline.exec();
  const withMeta: ModelMeta[] = [];

  for (let i = 0; i < modelIds.length; i++) {
    const hash = results?.[i]?.[1] as Record<string, string> | null | undefined;
    if (!hash || Object.keys(hash).length === 0) continue;

    const fallbackPriorityRaw = Number(
      hash.fallback_priority ?? Number.POSITIVE_INFINITY
    );
    const fallbackPriority = Number.isFinite(fallbackPriorityRaw)
      ? fallbackPriorityRaw
      : Number.POSITIVE_INFINITY;
    const typeRaw = (hash.type as string) || 'lite';
    const type = typeRaw === 'hard' ? 'hard' : 'lite';

    withMeta.push({
      id: modelIds[i],
      type,
      fallbackPriority,
    });
  }

  const hard = withMeta
    .filter((m) => m.type === 'hard')
    .sort(sortByFallbackPriority)
    .map((m) => m.id);

  const lite = withMeta
    .filter((m) => m.type === 'lite')
    .sort(sortByFallbackPriority)
    .map((m) => m.id);

  return { hard, lite };
};

const selectRequestedAndFallback = (
  preferred: aiModelIds[],
  secondary: aiModelIds[]
): ModelChain => {
  if (preferred.length === 0 && secondary.length === 0) {
    throw new Error('No models configured in Redis');
  }

  // Select requested from preferred pool if available, otherwise from secondary.
  const source = preferred.length > 0 ? preferred : secondary;
  const requestedModel = source[source.length - 1];

  const remainingPreferred =
    preferred.length > 0 ? preferred.filter((m) => m !== requestedModel) : [];
  const remainingSecondary =
    preferred.length === 0
      ? secondary.filter((m) => m !== requestedModel)
      : secondary.slice();

  return {
    requestedModel,
    fallbackModels: [...remainingPreferred, ...remainingSecondary],
  };
};

export const resolveModelChain = async (
  redis: RedisWithScripts,
  mode: Mode
): Promise<ModelChain> => {
  const { hard, lite } = await loadModelsByType(redis);
  const isHardPreferred = isHardMode(mode);

  if (isHardPreferred) {
    return selectRequestedAndFallback(hard, lite);
  }

  return selectRequestedAndFallback(lite, []);
};
