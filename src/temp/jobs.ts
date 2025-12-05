// src/routes/jobsRoutes.ts (Оновлено)

import { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { redisKeys } from "../redis/keys";
import { getCachedUserLimits, UserLimits } from "../services/limitsCache";

import type { Mode } from "../../types/mode";

interface RunAiJobBody {
  userId: string;
  role: "user" | "admin";
  model: string;
  fallbackModels?: string[];
  payload: {
    cvDescription: string;
    jobDescription?: string;
    mode: Mode;
    locale: string;
  };
}

// Припускаємо, що FastifyInstance має доступ до Lua SHA:
declare module "fastify" {
  interface FastifyInstance {
    luaSHA: {
      combinedCheckAndAcquire: string; // SHA хеш нашого скрипта
    };
  }
}

// Функція для отримання актуальних лімітів моделі, тут має бути логіка кешування
// Винесемо це в utils
const getModelLimits = async (redis: Redis, model: string) => {
  const limits = await redis.hgetall(redisKeys.modelLimits(model));
  // Припускаємо дефолтні значення, якщо не знайдено
  return {
    rpm: limits.rpm ? Number(limits.rpm) : 100,
    rpd: limits.rpd ? Number(limits.rpd) : 10000,
  };
};

// =========================================================================

export default async function jobsRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: RunAiJobBody }>("/run-ai-job", async (request, reply) => {
    const body = request.body;
    const jobId = uuidv4();
    const now = Date.now();

    // ... (Валідація залишається) ...

    const userLimits = await getCachedUserLimits(fastify.redis, body.userId, body.role);
    const isAdmin = body.role === "admin" || userLimits.unlimited;

    // 1. АПІ-РІВЕНЬ FALLBACK FSM
    const selectedModel = await chooseFirstAvailableModel(
      fastify.redis,
      body.model,
      body.fallbackModels ?? []
    );

    if (!selectedModel) {
      return reply.status(429).send({ ok: false, error: "MODEL_UNAVAILABLE" });
    }

    // 2. АТОМАРНА ПЕРЕВІРКА ТА СПОЖИВАННЯ (ТІЛЬКИ ДЛЯ ЗВИЧАЙНИХ USER)
    if (!isAdmin) {
      const result = await runAtomicChecks(
        fastify,
        body.userId,
        jobId,
        selectedModel,
        userLimits
      );

      if (result !== LimitCode.OK) {
        // Логіка Fallback FSM для Model Limit Exceeded (якщо потрібно)
        // Наразі просто повертаємо 429 з причиною
        return reply.status(429).send({
          ok: false,
          error: LimitCode[result],
          code: result,
        });
      }
    }

    // 3. ДОДАВАННЯ В ЧЕРГУ (РАЗОМ З МЕТАДАНИМИ)
    const jobData = {
      jobId,
      userId: body.userId,
      model: selectedModel,
      fallbackModels: body.fallbackModels ?? [],
      payload: body.payload,
      role: body.role,
    };

    // Запис Meta в Redis до додавання в чергу, щоб Job був visible
    await fastify.redis.hset(redisKeys.jobMeta(jobId), {
      user_id: body.userId,
      model: selectedModel,
      created_at: new Date(now).toISOString(),
      status: "queued",
      attempts: 0,
    });

    await fastify.queue.add("ai-job", jobData, {
      jobId,
      attempts: 3,
      removeOnComplete: false,
      removeOnFail: false,
    });

    return { jobId, model: selectedModel };
  });
}

/**
 * 💡 Атомарно перевіряє Concurrency, RPM, RPD, та споживає токени.
 */
async function runAtomicChecks(
  fastify: FastifyInstance,
  userId: string,
  jobId: string,
  model: string,
  userLimits: UserLimits
): Promise<LimitCode> {
  // 1. Отримання model limits
  const modelLimits = await getModelLimits(fastify.redis, model);

  // 2. Обчислення динамічних ARGV
  const utcDate = getUtcDate();
  const secondsUntilMidnight = getSecondsUntilMidnight();
  const nowMs = Date.now();

  // 3. Отримання RPD лімітів користувача для вибраної моделі
  const userRpdLimit = pickRpdLimit(userLimits, model);

  const keys = [
    // KEYS[1]: Model RPM
    redisKeys.modelLimits(model) + ":rpm_tokens",
    // KEYS[2]: Model RPD
    redisKeys.modelLimits(model) + ":rpd_tokens",
    // KEYS[3]: User RPM
    redisKeys.userLimits(userId) + `:${model}:rpm`,
    // KEYS[4]: User RPD
    redisKeys.userLimits(userId) + `:${model}:daily`,
    // KEYS[5]: User Concurrency Lock (ZSET)
    redisKeys.userActiveJobs(userId),
  ];

  const args = [
    // ARGV[1]: model_minute_limit (RPM)
    modelLimits.rpm,
    // ARGV[2]: model_day_limit (RPD)
    modelLimits.rpd,
    // ARGV[3]: user_minute_limit (RPM, у userLimits його немає, ставимо високе значення)
    // 💡 Спірне питання: Припускаємо, що User RPM = Model RPM, якщо не задано
    modelLimits.rpm,
    // ARGV[4]: user_day_limit (RPD)
    userRpdLimit || modelLimits.rpd, // Якщо null, використовуємо модельний RPD
    // ARGV[5]: concurrency_limit
    userLimits.max_concurrency ?? 1, // Припускаємо 1, якщо null
    // ARGV[6]: minute_ttl (seconds, 70s)
    CONCURRENCY_TTL_SECONDS,
    // ARGV[7]: day_ttl (seconds until midnight)
    secondsUntilMidnight,
    // ARGV[8]: consume_amount (токени)
    JOB_TOKEN_COST,
    // ARGV[9]: now_timestamp_ms (для ZSET cleanup)
    nowMs,
    // ARGV[10]: jobId (для ZADD)
    jobId,
  ];

  // 4. Виклик єдиного Lua-скрипта
  const result = await fastify.redis.evalsha(
    fastify.luaSHA.combinedCheckAndAcquire,
    keys.length,
    keys,
    args
  );

  return result as LimitCode;
}

const pickRpdLimit = (
  limits: Awaited<ReturnType<typeof getCachedUserLimits>>,
  modelId: string
) => {
  const isHard = modelId.toLowerCase().includes("pro");
  return isHard ? limits.hard_rpd : limits.lite_rpd;
};

const getUtcDate = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

const chooseFirstAvailableModel = async (
  redis: Redis,
  primary: string,
  fallbacks: string[]
): Promise<string | null> => {
  const chain = [primary, ...fallbacks];
  for (const modelName of chain) {
    const limits = await redis.hgetall(redisKeys.modelLimits(modelName));
    if (limits && Object.keys(limits).length > 0) {
      return modelName;
    }
  }

  return null;
};

export enum LimitCode {
  OK = 1,
  // Concurrency Lock
  CONCURRENCY_LIMIT_EXCEEDED = -0, // Використовуємо 0, як повертає concurrencyLock
  // Model Limits
  MODEL_RPM_EXCEEDED = -1,
  MODEL_RPD_EXCEEDED = -2,
  // User Limits
  USER_RPM_EXCEEDED = -3,
  USER_RPD_EXCEEDED = -4,
}

// Примітка: Константа CONCURRENCY_TTL_MS тепер 70s для буферу
export const CONCURRENCY_TTL_SECONDS = 70;
export const JOB_TOKEN_COST = 1; // Умовно, кожен Job коштує 1 токен
