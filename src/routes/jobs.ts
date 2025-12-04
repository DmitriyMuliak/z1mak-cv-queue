import { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { redisKeys } from "../redis/keys";
import { getCachedUserLimits } from "../services/limitsCache";
import { env } from "../config/env";
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

const CONCURRENCY_TTL_MS = 60_000;

export default async function jobsRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: RunAiJobBody }>("/run-ai-job", async (request, reply) => {
    const body = request.body;

    if (
      !body?.userId ||
      !body?.role ||
      !body?.model ||
      !body?.payload?.cvDescription ||
      !body?.payload?.mode ||
      !body?.payload?.locale
    ) {
      return reply.status(400).send({ ok: false, error: "INVALID_PAYLOAD" });
    }

    const userLimits = await getCachedUserLimits(
      fastify.redis,
      body.userId,
      body.role
    );
    const isAdmin = body.role === "admin" || userLimits.unlimited;

    const jobId = uuidv4();
    const now = Date.now();

    if (!isAdmin && userLimits.max_concurrency !== null) {
      const ok = await fastify.redis.concurrencyLock(
        redisKeys.userActiveJobs(body.userId),
        now,
        CONCURRENCY_TTL_MS,
        userLimits.max_concurrency,
        jobId,
        isAdmin
      );

      if (ok !== 1) {
        return reply.status(429).send({ ok: false, error: "CONCURRENCY_LIMIT" });
      }
    }

    if (!isAdmin) {
      const allowedRpd = pickRpdLimit(userLimits, body.model);
      if (allowedRpd !== null) {
        const rpdOk = await fastify.redis.userRpdCheck(
          redisKeys.userDailyRpd(body.userId, getUtcDate()),
          1,
          allowedRpd,
          new Date(now).toISOString(),
          isAdmin
        );

        if (rpdOk !== 1) {
          return reply.status(429).send({ ok: false, error: "USER_RPD_LIMIT" });
        }
      }
    }

    const selectedModel = await chooseFirstAvailableModel(
      fastify.redis,
      body.model,
      body.fallbackModels ?? []
    );

    if (!selectedModel) {
      return reply.status(429).send({ ok: false, error: "MODEL_LIMIT" });
    }

    await fastify.queue.add(
      "ai-job",
      {
        jobId,
        userId: body.userId,
        model: selectedModel,
        fallbackModels: body.fallbackModels ?? [],
        payload: body.payload,
        role: body.role,
      },
      {
        jobId,
        attempts: 3,
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    await fastify.redis.hset(redisKeys.jobMeta(jobId), {
      user_id: body.userId,
      model: selectedModel,
      created_at: new Date(now).toISOString(),
      status: "queued",
      attempts: 0,
    });

    return { jobId };
  });

  fastify.get("/job/:jobId", async (request, reply) => {
    const jobId = (request.params as any).jobId as string;
    if (!jobId) {
      return reply.status(400).send({ ok: false, error: "INVALID_JOB_ID" });
    }

    const result = await fastify.redis.hgetall(redisKeys.jobResult(jobId));
    if (result && Object.keys(result).length > 0) {
      return {
        status: result.status,
        data: parseMaybeJson(result.data),
        error: result.error,
        finished_at: result.finished_at,
      };
    }

    const meta = await fastify.redis.hgetall(redisKeys.jobMeta(jobId));
    if (meta && Object.keys(meta).length > 0) {
      return {
        status: meta.status ?? "queued",
        data: null,
        error: null,
        finished_at: null,
      };
    }

    return reply.status(404).send({ ok: false, error: "NOT_FOUND" });
  });
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

const parseMaybeJson = (input: string | undefined) => {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
};
