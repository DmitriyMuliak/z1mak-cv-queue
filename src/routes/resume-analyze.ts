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

const CONCURRENCY_TTL_SECONDS = 1860; // ~31 minutes so the slot does not expire before start
const MAX_WAIT_MINUTES = 30;
const QUEUE_BUFFER = 0.9;
const AVG_SECONDS = { hard: 25, lite: 15 };

const isHardMode = (mode: Mode) => mode.evaluationMode === 'byJob' && mode.depth === 'deep';

enum AcquireCode {
  OK = 1,
  ConcurrencyExceeded = 0,
  ModelRpdExceeded = -2,
  UserRpdExceeded = -4,
}

const computeMaxQueueLength = (rpm: number, rpd: number, avgSeconds: number) => {
  const rpmSafe = Math.max(rpm, 0);
  const perMinuteByDuration = avgSeconds > 0 ? 60 / avgSeconds : rpmSafe;
  const perMinute = Math.min(rpmSafe, perMinuteByDuration);
  const raw = Math.ceil(perMinute * MAX_WAIT_MINUTES * QUEUE_BUFFER);
  const dayCap = rpd > 0 ? rpd : raw;
  return Math.max(1, Math.min(raw, dayCap));
};

export default async function resumeRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: RunAiJobBody }>('/analyze', async (request, reply) => {
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
    const todayPT = getCurrentDatePT();
    const dayTtl = getSecondsUntilMidnightPT(); // TTL until 00:00 PT
    const modeType: 'hard' | 'lite' = isHardMode(body.payload.mode) ? 'hard' : 'lite';

    const chainFromMode = resolveModelChain(body.payload.mode);
    const requestedModel = chainFromMode.requestedModel;
    const modelChain = [requestedModel, ...chainFromMode.fallbackModels];

    let selectedModel: string | null = null;
    let selectedModelRpm = 0;
    let selectedModelRpd = 0;

    for (const candidate of modelChain) {
      const modelLimits = await fastify.redis.hgetall(redisKeys.modelLimits(candidate));

      // Check for deleted models from DB
      if (!modelLimits || Object.keys(modelLimits).length === 0) {
        continue;
      }

      const modelRpm = Number(modelLimits.rpm ?? 0);
      const modelRpd = Number(modelLimits.rpd ?? 0);
      const userDayLimit = isAdmin
        ? 0
        : modeType === 'hard'
          ? userLimits.hard_rpd ?? 0
          : userLimits.lite_rpd ?? 0;
      const concurrencyLimit = isAdmin ? 0 : (userLimits.max_concurrency ?? 0);

      const code = await fastify.redis.combinedCheckAndAcquire(
        [
          redisKeys.userTypeRpd(body.userId, modeType, todayPT),
          redisKeys.userActiveJobs(body.userId),
          redisKeys.modelRpd(candidate),
        ],
        [
          userDayLimit,
          concurrencyLimit,
          dayTtl,
          CONCURRENCY_TTL_SECONDS,
          1,
          now,
          jobId,
          modelRpd,
          dayTtl,
        ]
      );

      if (code === AcquireCode.OK) {
        selectedModel = candidate;
        selectedModelRpm = modelRpm;
        selectedModelRpd = modelRpd;
        break;
      }
      if (code === AcquireCode.ModelRpdExceeded) {
        continue;
      }
      if (code === AcquireCode.ConcurrencyExceeded) {
        return reply.status(429).send({ ok: false, error: 'CONCURRENCY_LIMIT' });
      }
      if (code === AcquireCode.UserRpdExceeded) {
        return reply.status(429).send({ ok: false, error: 'USER_RPD_LIMIT' });
      }
    }

    if (!selectedModel) {
      return reply.status(429).send({ ok: false, error: 'MODEL_LIMIT' });
    }
    
    const avgSeconds = modeType === 'hard' ? AVG_SECONDS.hard : AVG_SECONDS.lite;
    const maxQueueLength = computeMaxQueueLength(selectedModelRpm, selectedModelRpd, avgSeconds);
    
    const waitingKey = redisKeys.queueWaitingModel(selectedModel);
    const waitingCount = await fastify.redis.incr(waitingKey);
    
    if (waitingCount > maxQueueLength) {
      await fastify.redis.decr(waitingKey);
      return reply.status(429).send({
        ok: false,
        error: 'QUEUE_FULL',
        message: `Queue backlog too large for model ${selectedModel}`,
      });
    }

    const targetQueue = modeType === 'hard' ? fastify.queueHard : fastify.queueLite;

    try {
      await Promise.all([
        targetQueue.add(
          'ai-job',
          {
            jobId,
            userId: body.userId,
            requestedModel,
            model: selectedModel,
            payload: body.payload,
            role: body.role,
            modeType,
          },
          {
            jobId,
          }
        ),
        fastify.redis.hset(redisKeys.jobMeta(jobId), {
          user_id: body.userId,
          requested_model: requestedModel,
          processed_model: selectedModel,
          created_at: new Date(now).toISOString(),
          status: 'queued',
          attempts: 0,
          mode_type: modeType,
        }),
      ]);
    } catch (err) {
      await fastify.redis.decr(waitingKey);
      throw err;
    }

    return { jobId };
  });

  fastify.get<{ Params: { jobId: string } }>('/:id/result', async (request, reply) => {
    const jobId = request.params.jobId as string;
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

  fastify.get<{ Params: { jobId: string } }>('/:id/status', async (request, reply) => {
    const jobId = request.params.jobId as string;
    if (!jobId) {
      return reply.status(400).send({ ok: false, error: 'INVALID_JOB_ID' });
    }

    const [resultStatus, metaStatus] = await Promise.all([
      fastify.redis.hget(redisKeys.jobResult(jobId), 'status'),
      fastify.redis.hget(redisKeys.jobMeta(jobId), 'status'),
    ]);

    if (resultStatus) {
      return { status: resultStatus };
    }
    if (metaStatus) {
      return { status: metaStatus || 'queued' };
    }

    return reply.status(404).send({ ok: false, error: 'NOT_FOUND' });
  });
}

const parseMaybeJson = (input: string | undefined) => {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
};
