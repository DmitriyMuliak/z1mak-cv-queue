import type { Worker } from 'bullmq';
import { redisKeys } from '../redis/keys';
import type { RedisWithScripts } from '../redis/client';
import type { ModeType } from './types';

export type WorkerMap = { lite: Worker; hard: Worker };
export type WorkerFactory = (queueType: ModeType, concurrency: number) => Worker;
export type { ModeType } from './types';

export const DEFAULT_CONCURRENCY = { hard: 3, lite: 8 };

const parseConcurrency = (raw: string | null, fallback: number) => {
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const fetchConcurrencyConfig = async (redis: RedisWithScripts) => {
  const [liteRaw, hardRaw] = await Promise.all([
    redis.get(redisKeys.workerConcurrency('lite')),
    redis.get(redisKeys.workerConcurrency('hard')),
  ]);

  return {
    lite: parseConcurrency(liteRaw, DEFAULT_CONCURRENCY.lite),
    hard: parseConcurrency(hardRaw, DEFAULT_CONCURRENCY.hard),
  };
};

type ConcurrencyManagerDeps = {
  redis: RedisWithScripts;
  createWorker: WorkerFactory;
  workersRef: () => WorkerMap | undefined;
};

export const createConcurrencyManager = ({
  redis,
  createWorker,
  workersRef,
}: ConcurrencyManagerDeps) => {
  const activeConcurrency = { ...DEFAULT_CONCURRENCY };

  const reloadWorker = async (queueType: ModeType, concurrency: number) => {
    const workers = workersRef();
    if (!workers) return;
    const old = workers[queueType];
    await old.close();
    workers[queueType] = createWorker(queueType, concurrency);
  };

  const initWorkers = async (): Promise<WorkerMap> => {
    const desired = await fetchConcurrencyConfig(redis);
    activeConcurrency.lite = desired.lite;
    activeConcurrency.hard = desired.hard;
    return {
      lite: createWorker('lite', desired.lite),
      hard: createWorker('hard', desired.hard),
    };
  };

  const refreshConcurrency = async () => {
    try {
      const desired = await fetchConcurrencyConfig(redis);
      const updates: Array<Promise<void>> = [];

      if (desired.lite !== activeConcurrency.lite) {
        activeConcurrency.lite = desired.lite;
        updates.push(reloadWorker('lite', desired.lite));
      }
      if (desired.hard !== activeConcurrency.hard) {
        activeConcurrency.hard = desired.hard;
        updates.push(reloadWorker('hard', desired.hard));
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    } catch (err) {
      console.error('Failed to refresh worker concurrency', err);
    }
  };

  return {
    initWorkers,
    refreshConcurrency,
    getActive: () => ({ ...activeConcurrency }),
  };
};
