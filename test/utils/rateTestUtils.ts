import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { v5 as uuidv5 } from 'uuid';
import { Queue } from 'bullmq';
import type { Client } from 'pg';
import { redisKeys } from '../../src/redis/keys';
import { parseSSE, ParsedSSEEvent } from '../helpers/sse-parser';
import type { Mode } from '../../src/types/mode';

export const composeRequested = process.env.TEST_USE_COMPOSE !== '0';
export const dockerAvailable = composeRequested
  ? (() => {
      try {
        execSync('docker info', { stdio: 'ignore' });
        return true;
      } catch {
        console.error('[rateTestUtils] Docker is not available');
        return false;
      }
    })()
  : false;

export const usingCompose = composeRequested && dockerAvailable;
export const composeFile = process.env.COMPOSE_FILE ?? 'docker-compose.test.yml';
const runScope = process.env.TEST_RUN_SCOPE ?? randomUUID().slice(0, 8);
const TEST_USER_ID_NAMESPACE = '5f5b4f50-8b5a-4e74-9678-4c6a63f7c391';

const poolId = Number(process.env.VITEST_POOL_ID ?? 0);
// Integration tests run with a shared runtime (global setup), so ports must stay stable
// across setup and workers. Enable pool-based offset only when explicitly requested.
const usePoolOffset = process.env.TEST_USE_POOL_OFFSET === '1';
const offset = usePoolOffset ? poolId * 100 : 0;

const TEST_API_PORT = 4000 + offset;
const TEST_REDIS_PORT = 6379 + offset;
const TEST_MOCK_GEMINI_PORT = 8080 + offset;
const TEST_DB_PORT_DEFAULT = 54321 + offset;
export const TEST_DB_PORT = Number(process.env.TEST_DB_PORT ?? TEST_DB_PORT_DEFAULT);
const TEST_DB_CONNECTION_STRING_DEFAULT = `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres`;

// docker ps --filter "name=cv-queue-test"
export const PROJECT_NAME = usePoolOffset
  ? `cv-queue-test-${poolId}`
  : 'cv-queue-test';

export const API_URL =
  process.env.TEST_API_URL ??
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : undefined) ??
  `http://127.0.0.1:${TEST_API_PORT}`;
export const REDIS_URL =
  process.env.TEST_REDIS_URL ??
  process.env.REDIS_URL ??
  `redis://127.0.0.1:${TEST_REDIS_PORT}`;
export const GEMINI_MOCK_CONFIG_URL =
  process.env.GEMINI_MOCK_CONFIG_URL ??
  (process.env.GEMINI_MOCK_URL ? `${process.env.GEMINI_MOCK_URL}/__config` : undefined) ??
  `http://127.0.0.1:${TEST_MOCK_GEMINI_PORT}/__config`;
export const INTERNAL_KEY =
  process.env.TEST_INTERNAL_KEY ?? process.env.INTERNAL_API_KEY ?? 'internal-secret';
export const TEST_DB_CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  TEST_DB_CONNECTION_STRING_DEFAULT;
export const scopeValue = (value: string) => `${value}-${runScope}`;
export const scopeUserId = (value: string) =>
  uuidv5(scopeValue(value), TEST_USER_ID_NAMESPACE);

const DEFAULT_MODEL_API_NAMES: Record<string, string> = {
  flash3: 'gemini-1.5-pro',
  flash: 'gemini-1.5-flash',
  flashLite: 'gemini-1.5-flash-8b',
};

export type RunBody = {
  userId: string;
  role: 'user' | 'admin';
  payload: {
    cvDescription: string;
    jobDescription?: string;
    mode: Mode;
    locale: string;
  };
};

export const createBody = (mode: 'hard' | 'lite' = 'lite'): RunBody => {
  const body: RunBody = {
    userId: 'user-1',
    role: 'user',
    payload: {
      cvDescription: 'Sample CV',
      jobDescription: 'Sample job',
      mode: {
        evaluationMode: 'general',
        domain: 'common',
        depth: 'standard',
      },
      locale: 'en',
    },
  };

  if (mode === 'hard') {
    body.payload.mode = {
      evaluationMode: 'byJob',
      domain: 'it',
      depth: 'deep',
    };
  }

  return body;
};

export const requestApi = async (
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  headers: Record<string, string> = {}
) => {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as any;
  return { status: res.status, json };
};

export const waitForApi = async (retries = 60) => {
  let lastStatus: number | undefined;
  let lastBody: any;
  for (let i = 0; i < retries; i++) {
    try {
      const { status, json } = await requestApi('/health', 'GET', undefined, {
        'x-internal-api-key': INTERNAL_KEY,
      });
      lastStatus = status;
      lastBody = json;
      if (status >= 200 && status < 300) return;
    } catch {
      lastBody = 'fetch_failed';
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `API did not become ready (status=${lastStatus ?? 'unknown'}, body=${JSON.stringify(lastBody)})`
  );
};

export const postJob = async (body: RunBody) =>
  requestApi('/resume/analyze', 'POST', body, {
    'Content-Type': 'application/json',
    'x-internal-api-key': INTERNAL_KEY,
    'x-test-user': body.userId,
    'x-test-role': 'authenticated',
    'x-test-user-role': body.role,
  });

export const postStreamJob = async (body: RunBody) => {
  const headers = {
    'Content-Type': 'application/json',
    'x-internal-api-key': INTERNAL_KEY,
    'x-test-user': body.userId,
    'x-test-role': 'authenticated',
    'x-test-user-role': body.role,
  };
  return fetch(`${API_URL}/resume/analyze`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, streaming: true }),
  });
};

export const connectToStream = async (
  jobId: string,
  userId: string,
  role: string,
  lastEventId?: string
) => {
  const headers = {
    'Content-Type': 'application/json',
    'x-internal-api-key': INTERNAL_KEY,
    'x-test-user': userId,
    'x-test-role': 'authenticated',
    'x-test-user-role': role,
  };
  return fetch(`${API_URL}/resume/${jobId}/result-stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lastEventId }),
  });
};

export const sseToArray = async (response: Response): Promise<ParsedSSEEvent[]> => {
  const reader = response.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  return parseSSE(buffer);
};
export const ndjsonToArray = async (response: Response): Promise<any[]> => {
  const reader = response.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  const result: any[] = [];
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        const decoded = decoder.decode(value, { stream: true });
        // console.log('[ndjsonToArray] Raw value:', decoded);
        buffer += decoded;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              result.push(parsed);
            } catch (e) {
              console.error('[ndjsonToArray] Failed to parse line:', { line, e });
            }
          }
        }
      }

      if (done) {
        // Process last bit of buffer
        if (buffer.trim()) {
          try {
            result.push(JSON.parse(buffer));
          } catch (e) {
            console.error('[ndjsonToArray] Process last bit of buffer:', e);
          }
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return result;
};

export const seedModelLimits = async (
  redis: Redis,
  modelId: string,
  rpm: number,
  rpd: number
) => {
  const apiName = DEFAULT_MODEL_API_NAMES[modelId] ?? modelId;
  await redis.sadd(redisKeys.modelIds(), modelId);
  await redis.hset(redisKeys.modelLimits(modelId), { rpm, rpd, api_name: apiName });
};

export const seedModelLimitsFull = async (
  redis: Redis,
  modelId: string,
  rpm: number,
  rpd: number,
  type: 'lite' | 'hard',
  fallbackPriority: number
) => {
  const apiName = DEFAULT_MODEL_API_NAMES[modelId] ?? modelId;
  await redis.sadd(redisKeys.modelIds(), modelId);
  await redis.hset(redisKeys.modelLimits(modelId), {
    rpm,
    rpd,
    api_name: apiName,
    type,
    fallback_priority: fallbackPriority.toString(),
  });
};

export const configureMockGemini = async (config: {
  mode?: 'success' | 'fail';
  status?: number;
  text?: string;
  delayMs?: number;
}) => {
  await fetch(GEMINI_MOCK_CONFIG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
};

export const waitForJobResult = async (
  redis: Redis,
  jobId: string,
  timeoutMs = 10_000
): Promise<Record<string, string>> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await redis.hgetall(redisKeys.jobResult(jobId));
    if (result && Object.keys(result).length > 0) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Job ${jobId} did not complete`);
};

export const waitForProcessedModel = async (
  redis: Redis,
  jobId: string,
  timeoutMs = 10_000
) => {
  const result = await waitForJobResult(redis, jobId, timeoutMs);
  return result.used_model ?? result.processed_model ?? null;
};

export const truncateCvAnalyzes = async (pgClient: Pick<Client, 'query'>) => {
  await pgClient.query('TRUNCATE TABLE cv_analyzes');
};

const LITE_QUEUE_NAME = process.env.BULLMQ_QUEUE_LITE ?? 'ai-jobs-lite';
const HARD_QUEUE_NAME = process.env.BULLMQ_QUEUE_HARD ?? 'ai-jobs-hard';

const getPendingJobsCount = async (queue: Queue) => {
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'delayed',
    'paused',
    'prioritized'
  );
  return (
    counts.waiting +
    counts.active +
    counts.delayed +
    counts.paused +
    counts.prioritized
  );
};

export const waitForQueuesIdle = async (
  timeoutMs = 60_000,
  pollMs = 200
) => {
  const queueLite = new Queue(LITE_QUEUE_NAME, {
    connection: { url: REDIS_URL },
  });
  const queueHard = new Queue(HARD_QUEUE_NAME, {
    connection: { url: REDIS_URL },
  });

  try {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const [litePending, hardPending] = await Promise.all([
        getPendingJobsCount(queueLite),
        getPendingJobsCount(queueHard),
      ]);

      if (litePending === 0 && hardPending === 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    throw new Error('Queues did not become idle before timeout');
  } finally {
    await Promise.allSettled([queueLite.close(), queueHard.close()]);
  }
};

export const resetIntegrationState = async (
  redis: Redis,
  pgClient?: Pick<Client, 'query'>
) => {
  await waitForQueuesIdle();
  if (pgClient) {
    await Promise.all([redis.flushall(), truncateCvAnalyzes(pgClient)]);
    return;
  }
  await redis.flushall();
};

// TODO: migrate to "testcontainers" package
export const startCompose = async () => {
  if (!usingCompose) return;

  const env = {
    ...process.env,
    TEST_API_PORT: String(TEST_API_PORT),
    TEST_REDIS_PORT: String(TEST_REDIS_PORT),
    TEST_MOCK_GEMINI_PORT: String(TEST_MOCK_GEMINI_PORT),
    TEST_DB_PORT: String(TEST_DB_PORT),
  };

  console.log('startCompose - PROJECT_NAME:', PROJECT_NAME);

  execSync(
    `docker compose -p ${PROJECT_NAME} -f ${composeFile} up -d --build db redis api worker mock-gemini`,
    {
      stdio: 'inherit',
      env,
    }
  );
};

// docker compose -p cv-queue-test-0 down -v
// docker compose -f docker-compose.test.yml down -v
export const stopCompose = async () => {
  if (!usingCompose) return;
  execSync(
    `docker compose -p ${PROJECT_NAME} -f ${composeFile} down -v --remove-orphans`,
    {
      stdio: 'inherit',
    }
  );
};

export const createRedis = () => new Redis(REDIS_URL);

export { redisKeys };
