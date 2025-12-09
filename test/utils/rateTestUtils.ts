import { execSync } from 'node:child_process';
import Redis from 'ioredis';
import { redisKeys } from '../../src/redis/keys';
import type { Mode } from '../../types/mode';

export const composeRequested = process.env.TEST_USE_COMPOSE !== '0';
export const dockerAvailable = (() => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

export const usingCompose = composeRequested && dockerAvailable;
export const composeFile = process.env.COMPOSE_FILE ?? 'docker-compose.test.yml';

export const API_URL = process.env.TEST_API_URL ?? 'http://localhost:4000';
export const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';
export const GEMINI_MOCK_CONFIG_URL =
  process.env.GEMINI_MOCK_CONFIG_URL ?? 'http://localhost:8080/__config';
export const INTERNAL_KEY = process.env.TEST_INTERNAL_KEY ?? 'internal-secret';

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
  requestApi('/run-ai-job', 'POST', body, {
    'Content-Type': 'application/json',
    'x-internal-api-key': INTERNAL_KEY,
  });

export const seedModelLimits = async (redis: Redis, modelId: string, rpm: number, rpd: number) => {
  await redis.hset(redisKeys.modelLimits(modelId), { rpm, rpd });
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
    await new Promise((resolve) => setTimeout(resolve, 100));
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

export const startCompose = async () => {
  if (!usingCompose) return;
  // execSync(`docker compose -f ${composeFile} up -d --build redis api worker mock-gemini`, {
  //   stdio: 'inherit',
  // });
  execSync(`docker compose -f ${composeFile} up -d redis api worker mock-gemini`, {
    stdio: 'inherit',
  });
  await waitForApi();
};

export const stopCompose = async () => {
  if (!usingCompose) return;
  execSync(`docker compose -f ${composeFile} down -v --remove-orphans`, { stdio: 'inherit' });
};

export const createRedis = () => new Redis(REDIS_URL);

export { redisKeys };
