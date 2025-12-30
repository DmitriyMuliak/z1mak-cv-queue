import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { redisKeys } from '../../redis/keys';
import { db } from '../../db/client';
import { getCachedUserLimits } from '../../services/limitsCache';
import { resolveModelChain } from '../../services/modelSelector';
import { getCurrentDatePT, getSecondsUntilMidnightPT } from '../../utils/time';
import { getModeType } from '../../utils/mode';
import { AVG_SECONDS, computeMaxQueueLength } from './queueUtils';
import { selectAvailableModel } from './modelSelection';
import { enqueueJob } from './enqueueJob';
import {
  JobIdParams,
  JobIdParamsSchema,
  RecentUserQuery,
  RecentUserQuerySchema,
  RunAiJobBody,
  RunAiJobBodySchema,
  UserIdParams,
  UserIdParamsSchema,
} from './schema';
import { parseMaybeJson } from '../../utils/parseJson';
import { ModeType } from '../../types/mode';
import { numberFromQuery } from '../../utils/queryUtils';

const CONCURRENCY_TTL_SECONDS = 1860; // ~31 minutes so the slot does not expire before start

export default async function resumeRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: RunAiJobBody }>(
    '/analyze',
    { schema: { body: RunAiJobBodySchema } },
    async (request, reply) => {
      const body = request.body;

      const userLimits = await getCachedUserLimits(fastify.redis, body.userId, body.role);
      const isAdmin = body.role === 'admin' || userLimits.unlimited;

      const jobId = uuidv4();
      const now = Date.now();
      const todayPT = getCurrentDatePT();
      const dayTtl = getSecondsUntilMidnightPT(); // TTL until 00:00 PT
      const modeType: ModeType = getModeType(body.payload.mode);

      const chainFromMode = resolveModelChain(body.payload.mode);
      const requestedModel = chainFromMode.requestedModel;
      const modelChain = [requestedModel, ...chainFromMode.fallbackModels];

      const selection = await selectAvailableModel({
        redis: fastify.redis,
        modelChain,
        userId: body.userId,
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
        return reply.status(429).send({ ok: false, error: selection.error });
      }

      const {
        model: selectedModel,
        modelRpm: selectedModelRpm,
        modelRpd: selectedModelRpd,
      } = selection;

      const avgSeconds = modeType === 'hard' ? AVG_SECONDS.hard : AVG_SECONDS.lite;
      const maxQueueLength = computeMaxQueueLength(
        selectedModelRpm,
        selectedModelRpd,
        avgSeconds
      );

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

      await enqueueJob({
        queue: targetQueue,
        redis: fastify.redis,
        waitingKey,
        jobId,
        requestedModel,
        selectedModel,
        body,
        modeType,
        createdAtMs: now,
      });

      return { jobId };
    }
  );

  fastify.get<{ Params: JobIdParams }>(
    '/:id/result',
    { schema: { params: JobIdParamsSchema } },
    async (request, reply) => {
      const { id: jobId } = request.params;

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

      // Fallback to DB (Redis TTL may have expired)
      const dbResult = await db.query<{
        status: string;
        result: unknown;
        error: string | null;
        finished_at: Date | null;
        created_at: Date;
      }>('SELECT status, result, error, finished_at, created_at FROM job WHERE id = $1', [
        jobId,
      ]);
      if (dbResult.rows.length > 0) {
        const row = dbResult.rows[0];
        return {
          status: row.status,
          data: row.result,
          error: row.error,
          finishedAt: row.finished_at,
          createdAt: row.created_at,
        };
      }

      return reply.status(404).send({ ok: false, error: 'NOT_FOUND' });
    }
  );

  fastify.get<{ Params: JobIdParams }>(
    '/:id/status',
    { schema: { params: JobIdParamsSchema } },
    async (request, reply) => {
      const { id: jobId } = request.params;

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

      const dbStatus = await db.query('SELECT status FROM job WHERE id = $1', [jobId]);
      if (dbStatus.rows.length > 0) {
        return { status: dbStatus.rows[0].status as string };
      }

      return reply.status(404).send({ ok: false, error: 'NOT_FOUND' });
    }
  );

  fastify.get<{ Params: UserIdParams; Querystring: RecentUserQuery }>(
    '/user/:userId/recent',
    { schema: { params: UserIdParamsSchema, querystring: RecentUserQuerySchema } },
    async (request) => {
      const { userId } = request.params;
      const limit = Math.min(
        Math.max(1, Math.floor(numberFromQuery(request.query.limit, 20))),
        100
      );
      const offset = Math.max(0, Math.floor(numberFromQuery(request.query.offset, 0)));

      const result = await db.query<{
        id: string;
        finished_at: Date | null;
        created_at: Date;
      }>(
        `
        SELECT id, finished_at, created_at
        FROM cv_analyzes
        WHERE user_id = $1
        ORDER BY COALESCE(finished_at, created_at) DESC
        LIMIT $2 OFFSET $3
      `,
        [userId, limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        finishedAt: row.finished_at,
        createdAt: row.created_at,
      }));
    }
  );
}
