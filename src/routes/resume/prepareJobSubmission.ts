import { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { redisKeys } from '../../redis/keys';

import { getCachedUserLimits } from '../../services/limitsCache';
import { resolveModelChain } from '../../services/modelSelector';
import { getCurrentDatePT, getSecondsUntilMidnightPT } from '../../utils/time';
import { getModeType } from '../../utils/mode';
import { AVG_SECONDS, computeMaxQueueLength } from './queueUtils';
import { selectAvailableModel } from './modelSelection';
import { RunAiJobBody } from './schema';

import { ModeType } from '../../types/mode';
import { CONCURRENCY_TTL_SECONDS } from './consts';

type PrepResult =
  | {
      ok: true;
      jobId: string;
      now: number;
      modeType: ModeType;
      requestedModel: string;
      selectedModel: string;
      waitingKey: string;
      userRole: 'user' | 'admin';
      userId: string;
      body: RunAiJobBody;
    }
  | { ok: false; errorStatus: number; error: string; message?: string };

/**
 * Helper to prepare job data and validate limits
 */
export const prepareJobSubmission = async (
  fastify: FastifyInstance,
  request: FastifyRequest<{ Body: RunAiJobBody }>
): Promise<PrepResult> => {
  const { body } = request;
  const userId = request.user.sub;
  const userRole = request.user.app_metadata.role as 'user' | 'admin';

  const userLimits = await getCachedUserLimits(fastify.redis, userId, userRole);
  const isAdmin = userRole === 'admin' || userLimits.unlimited;

  const jobId = uuidv4();
  const now = Date.now();
  const todayPT = getCurrentDatePT();
  const dayTtl = getSecondsUntilMidnightPT();
  const modeType = getModeType(body.payload.mode);

  const { requestedModel, fallbackModels } = await resolveModelChain(
    fastify.redis,
    body.payload.mode
  );
  const modelChain = [requestedModel, ...fallbackModels];

  const selection = await selectAvailableModel({
    redis: fastify.redis,
    modelChain,
    userId,
    isAdmin,
    userLimits,
    modeType,
    todayPT,
    dayTtl,
    now,
    jobId,
    concurrencyTtlSeconds: CONCURRENCY_TTL_SECONDS,
  });

  if (selection.status === 'error') {
    return { ok: false, errorStatus: 429, error: selection.error };
  }

  const { model: selectedModel, modelRpm, modelRpd } = selection;
  const avgSeconds = modeType === 'hard' ? AVG_SECONDS.hard : AVG_SECONDS.lite;
  const maxQueueLength = computeMaxQueueLength(modelRpm, modelRpd, avgSeconds);

  const waitingKey = redisKeys.queueWaitingModel(selectedModel);
  const waitingCount = await fastify.redis.incr(waitingKey);

  if (waitingCount > maxQueueLength) {
    await fastify.redis.decr(waitingKey);
    return {
      ok: false,
      errorStatus: 429,
      error: 'QUEUE_FULL',
      message: `Queue backlog too large for model ${selectedModel}`,
    };
  }

  return {
    ok: true,
    jobId,
    now,
    modeType,
    requestedModel,
    selectedModel,
    waitingKey,
    userRole,
    userId,
    body,
  };
};
