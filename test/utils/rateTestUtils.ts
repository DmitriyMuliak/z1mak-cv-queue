import { execSync } from 'node:child_process';
import Redis from 'ioredis';
import { redisKeys } from '../../src/redis/keys';
import type { Mode } from '../../src/types/mode';

export const composeRequested = process.env.TEST_USE_COMPOSE !== '0';
export const dockerAvailable = (() => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    console.error('[rateTestUtils] Docker is not available');
    return false;
  }
})();

export const usingCompose = composeRequested && dockerAvailable;
export const composeFile = process.env.COMPOSE_FILE ?? 'docker-compose.test.yml';

const poolId = Number(process.env.VITEST_POOL_ID ?? 0);
const offset = poolId * 100;

const TEST_API_PORT = 4000 + offset;
const TEST_REDIS_PORT = 6379 + offset;
const TEST_MOCK_GEMINI_PORT = 8080 + offset;
export const TEST_DB_PORT = 54321 + offset;

export const PROJECT_NAME = `cv-queue-test-${poolId}`; // docker ps --filter "name=cv-queue-test"

export const API_URL = process.env.TEST_API_URL ?? `http://127.0.0.1:${TEST_API_PORT}`;
export const REDIS_URL =
  process.env.TEST_REDIS_URL ?? `redis://127.0.0.1:${TEST_REDIS_PORT}`;
export const GEMINI_MOCK_CONFIG_URL =
  process.env.GEMINI_MOCK_CONFIG_URL ??
  `http://127.0.0.1:${TEST_MOCK_GEMINI_PORT}/__config`;
export const INTERNAL_KEY = process.env.TEST_INTERNAL_KEY ?? 'internal-secret';

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
  return fetch(`${API_URL}/resume/analyze-stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
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
  await waitForApi();
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
