import { describe, it, expect, beforeEach } from 'vitest';
import { redisKeys } from '../../../src/redis/keys';
import { loadModelsByType, resolveModelChain } from '../../../src/services/modelSelector';
import type { Mode } from '../../../src/types/mode';
import { FakeRedis } from '../../mock/Redis';

const seedModels = (
  redis: FakeRedis,
  models: Array<{ id: string; type: 'hard' | 'lite'; fallback_priority: number }>
) => {
  redis.del(redisKeys.modelIds());
  redis.sadd(redisKeys.modelIds(), ...models.map((m) => m.id));

  for (const model of models) {
    redis.hset(redisKeys.modelLimits(model.id), {
      api_name: `api-${model.id}`,
      rpm: 10,
      rpd: 20,
      type: model.type,
      fallback_priority: model.fallback_priority,
    });
  }
};

describe('modelSelector', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
    redis.reset();
  });

  it('loads and sorts models by type and fallback priority', async () => {
    seedModels(redis, [
      { id: 'hard-1', type: 'hard', fallback_priority: 1 },
      { id: 'hard-3', type: 'hard', fallback_priority: 3 },
      { id: 'hard-2', type: 'hard', fallback_priority: 2 },
      { id: 'lite-2', type: 'lite', fallback_priority: 2 },
      { id: 'lite-1', type: 'lite', fallback_priority: 1 },
    ]);

    const models = await loadModelsByType(redis as any);

    expect(models.hard).toEqual(['hard-1', 'hard-2', 'hard-3']);
    expect(models.lite).toEqual(['lite-1', 'lite-2']);
  });

  it('prefers hard mode and picks the lowest-priority hard model first', async () => {
    seedModels(redis, [
      { id: 'hard-1', type: 'hard', fallback_priority: 1 },
      { id: 'hard-3', type: 'hard', fallback_priority: 3 },
      { id: 'hard-2', type: 'hard', fallback_priority: 2 },
      { id: 'lite-2', type: 'lite', fallback_priority: 2 },
      { id: 'lite-1', type: 'lite', fallback_priority: 1 },
    ]);

    const hardMode: Mode = {
      evaluationMode: 'byJob',
      domain: 'it',
      depth: 'deep',
    };

    const chain = await resolveModelChain(redis as any, hardMode);

    expect(chain.requestedModel).toBe('hard-3');
    expect(chain.fallbackModels).toEqual(['hard-1', 'hard-2', 'lite-1', 'lite-2']);
  });

  it('falls back to lite ordering when no hard models exist', async () => {
    seedModels(redis, [
      { id: 'lite-1', type: 'lite', fallback_priority: 5 },
      { id: 'lite-2', type: 'lite', fallback_priority: 1 },
    ]);

    const hardMode: Mode = {
      evaluationMode: 'byJob',
      domain: 'common',
      depth: 'deep',
    };

    const chain = await resolveModelChain(redis as any, hardMode);

    expect(chain.requestedModel).toBe('lite-1');
    expect(chain.fallbackModels).toEqual(['lite-2']);
  });

  it('prefers lite mode and not appends any hard models as fallbacks', async () => {
    seedModels(redis, [
      { id: 'hard-1', type: 'hard', fallback_priority: 1 },
      { id: 'hard-2', type: 'hard', fallback_priority: 2 },
      { id: 'lite-1', type: 'lite', fallback_priority: 3 },
      { id: 'lite-2', type: 'lite', fallback_priority: 1 },
    ]);

    const liteMode: Mode = {
      evaluationMode: 'general',
      domain: 'it',
      depth: 'standard',
    };

    const chain = await resolveModelChain(redis as any, liteMode);

    expect(chain.requestedModel).toBe('lite-1');
    expect(chain.fallbackModels).toEqual(['lite-2']);
  });
});
