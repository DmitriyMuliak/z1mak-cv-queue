import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { redisKeys } from '../redis/keys';
import { getCachedUserLimits } from '../services/limitsCache';
import { resolveModelChain } from '../services/modelSelector';
import { getCurrentDatePT, getSecondsUntilMidnightPT } from '../utils/time';
import type { Mode } from '../../types/mode';

interface RunAiJobBody {
  userId: string;
  role: 'user' | 'admin';
  payload: {
    cvDescription: string;
    jobDescription?: string;
    mode: Mode;
    locale: string;
  };
}

const MINUTE_TTL = 70;

export enum LimitCode {
  OK = 1,
  // Concurrency Lock
  CONCURRENCY_LIMIT_EXCEEDED = -0, 
  // Model Limits
  MODEL_RPM_EXCEEDED = -1,
  MODEL_RPD_EXCEEDED = -2,
  // User Limits
  USER_RPM_EXCEEDED = -3,
  USER_RPD_EXCEEDED = -4,
}

export default async function jobsRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: RunAiJobBody }>('/run-ai-job', async (request, reply) => {
    const body = request.body;

    if (
      !body?.userId ||
      !body?.role ||
      !body?.payload?.cvDescription ||
      !body?.payload?.mode ||
      !body?.payload?.locale
    ) {
      return reply.status(400).send({ ok: false, error: 'INVALID_PAYLOAD' });
    }

    const userLimits = await getCachedUserLimits(fastify.redis, body.userId, body.role);
    const isAdmin = body.role === 'admin' || userLimits.unlimited;

    const jobId = uuidv4();
    const now = Date.now();

    const chainFromMode = resolveModelChain(body.payload.mode);
    const requestedModel = chainFromMode.requestedModel;
    const modelChain = [requestedModel, ...chainFromMode.fallbackModels];

    let selectedModel: string | null = null;
    const dayTtl = getSecondsUntilMidnightPT(); // TTL до 00:00 PT

    for (const candidate of modelChain) {
      const modelLimits = await fastify.redis.hgetall(redisKeys.modelLimits(candidate));

      // Check for deleted models from DB
      if (!modelLimits || Object.keys(modelLimits).length === 0) {
        continue;
      }

      const modelRpm = Number(modelLimits.rpm ?? 0);
      const modelRpd = Number(modelLimits.rpd ?? 0);
      
      const userMinuteLimit = isAdmin ? 0 : 4;
      
      const userDayLimit = isAdmin ? 0 : (pickRpdLimit(userLimits, candidate) ?? 0);
      
      const concurrencyLimit = isAdmin 
        ? 0 
        : (userLimits.max_concurrency ?? 0);
        
      const todayPT = getCurrentDatePT();

      const code = await fastify.redis.combinedCheckAndAcquire(
        [
          redisKeys.modelRpm(candidate),
          redisKeys.modelRpd(candidate),
          redisKeys.userModelRpm(body.userId, candidate),
          redisKeys.userModelRpd(body.userId, candidate, todayPT),
          redisKeys.userActiveJobs(body.userId),
        ],
        [
          modelRpm,
          modelRpd,
          userMinuteLimit,
          userDayLimit,
          concurrencyLimit,
          MINUTE_TTL,
          dayTtl,
          1,
          now,
          jobId,
          dayTtl, 
        ]
      );

      if (code === LimitCode.OK) {
        selectedModel = candidate;
        break;
      }
      if (code === LimitCode.CONCURRENCY_LIMIT_EXCEEDED) {
        return reply.status(429).send({ ok: false, error: 'CONCURRENCY_LIMIT' });
      }
      // Оскільки ми встановили RPM для адмінів на 0, цей ліміт спрацює лише для звичайних користувачів
      if (code === LimitCode.USER_RPM_EXCEEDED) { 
        return reply.status(429).send({ ok: false, error: 'USER_RPM_LIMIT' });
      }
      if (code === LimitCode.USER_RPD_EXCEEDED) {
        return reply.status(429).send({ ok: false, error: 'USER_RPD_LIMIT' });
      }
      // LimitCode.MODEL_RPD_EXCEEDED
      // LimitCode.MODEL_RPM_EXCEEDED
      // -1 / -2 => try next fallback
    }

    if (!selectedModel) {
      return reply.status(429).send({ ok: false, error: 'MODEL_LIMIT' });
    }

    await fastify.queue.add(
      'ai-job',
      {
        jobId,
        userId: body.userId,
        requestedModel,
        model: selectedModel,
        // fallbackModels: modelChain.filter((m) => m !== selectedModel), // Більше не потрібні у воркері
        payload: body.payload,
        role: body.role,
      },
      {
        jobId,
        attempts: 3,
        removeOnComplete: false,
        removeOnFail: false,
        backoff: {
          type: 'fixed',
          delay: 10000,
        },
      }
    );

    await fastify.redis.hset(redisKeys.jobMeta(jobId), {
      user_id: body.userId,
      requested_model: requestedModel,
      processed_model: selectedModel,
      created_at: new Date(now).toISOString(),
      status: 'queued',
      attempts: 0,
    });

    return { jobId };
  });

  fastify.get('/job/:jobId', async (request, reply) => {
    const jobId = (request.params as any).jobId as string;
    if (!jobId) {
      return reply.status(400).send({ ok: false, error: 'INVALID_JOB_ID' });
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
        status: meta.status ?? 'queued',
        data: null,
        error: null,
        finished_at: null,
      };
    }

    return reply.status(404).send({ ok: false, error: 'NOT_FOUND' });
  });
}

const pickRpdLimit = (
  limits: Awaited<ReturnType<typeof getCachedUserLimits>>,
  modelId: string
) => {
  // const isHard = modelId.toLowerCase().includes("pro"); // modelsByType
  const isHard = modelId === 'pro2dot5'; // need add Hash with model types
  return isHard ? limits.hard_rpd : limits.lite_rpd;
};

const parseMaybeJson = (input: string | undefined) => {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
};