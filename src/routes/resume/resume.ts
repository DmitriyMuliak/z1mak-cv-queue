import { FastifyInstance } from 'fastify';
import { redisKeys } from '../../redis/keys';
import { db } from '../../db/client';
import { enqueueJob } from './enqueueJob';
import {
  JobIdParams,
  JobIdParamsSchema,
  RecentUserQuery,
  RecentUserQuerySchema,
  RunAiJobBody,
  RunAiJobBodySchema,
  StreamJobBody,
  StreamJobBodySchema,
  UserIdParams,
  UserIdParamsSchema,
} from './schema';
import { parseMaybeJson } from '../../utils/parseJson';
import { numberFromQuery } from '../../utils/queryUtils';
import { sendSSE, setSSEHeaders } from '../../utils/sse';
import {
  trySendFinishedResultFromRedis,
  trySendFinishedResultFromDb,
  handleActiveStreaming,
} from './streamingLogic';
import type { CvAnalyzes } from '../../types/database/sup-database';
import { prepareJobSubmission } from './prepareJobSubmission';

export default async function resumeRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post<{ Body: RunAiJobBody }>(
    '/analyze',
    { schema: { body: RunAiJobBodySchema } },
    async (request, reply) => {
      const prep = await prepareJobSubmission(fastify, request);
      if (!prep.ok) {
        return reply
          .status(prep.errorStatus)
          .send({ ok: false, error: prep.error, message: prep.message });
      }

      const targetQueue =
        prep.modeType === 'hard' ? fastify.queueHard : fastify.queueLite;

      await enqueueJob({
        queue: targetQueue,
        redis: fastify.redis,
        waitingKey: prep.waitingKey,
        jobId: prep.jobId,
        requestedModel: prep.requestedModel,
        selectedModel: prep.selectedModel,
        body: prep.body,
        role: prep.userRole,
        userId: prep.userId,
        modeType: prep.modeType,
        createdAtMs: prep.now,
        streaming: prep.body.streaming,
      });

      return { jobId: prep.jobId };
    }
  );

  fastify.post<{ Params: JobIdParams; Body: StreamJobBody }>(
    '/:id/result-stream',
    { schema: { params: JobIdParamsSchema, body: StreamJobBodySchema } },
    async (request, reply) => {
      const { id: jobId } = request.params;
      const { lastEventId } = request.body;

      try {
        setSSEHeaders(reply);

        // 1. FAST PATH: Check for finished result in Redis
        if (await trySendFinishedResultFromRedis(jobId, fastify.redis, reply)) {
          return;
        }

        // 2. ACTIVE PATH: Check Meta/Stream and handle real-time delivery
        if (await handleActiveStreaming(jobId, fastify.redis, reply, lastEventId)) {
          return;
        }

        // 3. COLD PATH: Redis is empty, check Database for archived result
        if (await trySendFinishedResultFromDb(jobId, request, reply)) {
          return;
        }
        // 4. NOT FOUND: Neither Redis nor DB has any record
        await sendSSE(reply, jobId, 'error', {
          code: 'NOT_FOUND',
          message: 'Job not found',
        });
        reply.raw.end();
      } catch (err) {
        fastify.log.error({ err, jobId }, 'Streaming error');
        if (!reply.raw.writableEnded) {
          await sendSSE(reply, jobId, 'error', {
            code: 'SERVER_ERROR',
            message: 'Streaming failed',
          });
          reply.raw.end();
        }
      }
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
          finishedAt: result.finished_at,
        };
      }

      const meta = await fastify.redis.hgetall(redisKeys.jobMeta(jobId));
      if (meta && Object.keys(meta).length > 0) {
        return {
          status: meta.status ?? 'queued',
          data: null,
          error: null,
          finishedAt: null,
        };
      }

      const dbResult = await db.withUserContext(request.user, async (client) => {
        return client.query<
          Pick<CvAnalyzes, 'status' | 'result' | 'error' | 'created_at' | 'finished_at'>
        >(
          'SELECT status, result, error, finished_at, created_at FROM cv_analyzes WHERE id = $1',
          [jobId]
        );
      });

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

      return reply.status(404).send({ error: 'NOT_FOUND' });
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

      if (resultStatus) return { status: resultStatus };
      if (metaStatus) return { status: metaStatus || 'queued' };

      const dbStatus = await db.withUserContext(request.user, async (client) => {
        return client.query<Pick<CvAnalyzes, 'status'>>(
          'SELECT status FROM cv_analyzes WHERE id = $1',
          [jobId]
        );
      });

      if (dbStatus.rows.length > 0) {
        return { status: dbStatus.rows[0].status };
      }

      return reply.status(404).send({ error: 'NOT_FOUND' });
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

      const result = await db.withUserContext(request.user, async (client) => {
        return await client.query<
          Pick<CvAnalyzes, 'id' | 'status' | 'created_at' | 'finished_at'>
        >(
          `
            SELECT id, finished_at, created_at, status
            FROM cv_analyzes
            WHERE user_id = $1
            ORDER BY COALESCE(finished_at, created_at) DESC
            LIMIT $2 OFFSET $3
          `,
          [userId, limit, offset]
        );
      });

      return result.rows.map((row) => ({
        id: row.id,
        finishedAt: row.finished_at,
        createdAt: row.created_at,
        status: row.status,
      }));
    }
  );
}
