import { FastifyReply, FastifyRequest } from 'fastify';
import { redisKeys } from '../../redis/keys';
import { db } from '../../db/client';
import { parseMaybeJson } from '../../utils/parseJson';
import { sendSSE, sendKeepAlive, SSEData, StreamEntry } from '../../utils/sse';
import type { RedisWithScripts } from '../../redis/client';
import type { CvAnalyzes } from '../../types/database/sup-database';

/**
 * Checks only Redis for a finished job result.
 */
export async function trySendFinishedResultFromRedis(
  jobId: string,
  redis: RedisWithScripts,
  reply: FastifyReply
): Promise<boolean> {
  const result = await redis.hgetall(redisKeys.jobResult(jobId));
  if (result && Object.keys(result).length > 0) {
    await sendSSE(reply, jobId, 'snapshot', {
      content: parseMaybeJson(result.data),
      status: 'completed',
    });
    await sendSSE(reply, jobId, 'done', {});
    reply.raw.end();
    return true;
  }
  return false;
}

/**
 * Checks only Database for a finished job result.
 */
export async function trySendFinishedResultFromDb(
  jobId: string,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const dbResult = await db.withUserContext(request.user, async (client) => {
    return client.query<Pick<CvAnalyzes, 'status' | 'result' | 'error' | 'finished_at'>>(
      'SELECT status, result, error, finished_at FROM cv_analyzes WHERE id = $1',
      [jobId]
    );
  });

  if (dbResult.rows.length > 0) {
    const row = dbResult.rows[0];
    if (row.status === 'completed' || row.status === 'error') {
      await sendSSE(reply, jobId, 'snapshot', {
        content: row.result,
        status: row.status,
        error: row.error,
      });
      await sendSSE(reply, jobId, 'done', {});
      reply.raw.end();
      return true;
    }
  }
  return false;
}

/**
 * Reads history from the stream and either sends it as a single snapshot (new connection)
 * or as individual delta chunks (re-connection).
 */
export async function streamHistory(
  jobId: string,
  redis: RedisWithScripts,
  reply: FastifyReply,
  lastEventId?: string
): Promise<{ lastId: string; isCompleted: boolean }> {
  const streamKey = redisKeys.jobStream(jobId);
  const startId = lastEventId || '0';
  const history = await redis.xread('STREAMS', streamKey, startId);

  if (!history?.length) return { lastId: startId, isCompleted: false };

  const entries = history[0][1];
  if (!entries.length) return { lastId: startId, isCompleted: false };

  if (!lastEventId) {
    let fullContent = '';
    let status = 'processing';
    let finalId = startId;

    for (const [id, fields] of entries) {
      finalId = id;
      const dataStr = fields[1];
      const parsed = JSON.parse(dataStr) as StreamEntry;
      if (parsed.type === 'chunk') fullContent += parsed.data;
      else if (parsed.type === 'done') status = 'completed';
      else if (parsed.type === 'error') status = 'error';
    }

    await sendSSE(reply, finalId, 'snapshot', { content: fullContent || null, status });
    const isCompleted = status !== 'processing';
    if (isCompleted) {
      await sendSSE(reply, finalId, 'done', {});
      reply.raw.end();
    }
    return { lastId: finalId, isCompleted };
  }

  let currentId = startId;
  for (const [id, fields] of entries) {
    currentId = id;
    const dataStr = fields[1];
    const parsed = JSON.parse(dataStr) as StreamEntry;
    const { data: content, ...rest } = parsed;
    const sseData: SSEData = content ? { content, ...rest } : (rest as SSEData);

    await sendSSE(reply, id, parsed.type, sseData);
    if (parsed.type === 'done' || parsed.type === 'error') {
      reply.raw.end();
      return { lastId: id, isCompleted: true };
    }
  }

  return { lastId: currentId, isCompleted: false };
}

/**
 * Handles active streaming: Adaptive Polling for queued jobs,
 * History replay, and the live XREAD loop.
 */
export async function handleActiveStreaming(
  jobId: string,
  redis: RedisWithScripts,
  reply: FastifyReply,
  lastEventId?: string
): Promise<boolean> {
  const streamKey = redisKeys.jobStream(jobId);
  const meta = await redis.hgetall(redisKeys.jobMeta(jobId));
  const streamExists = await redis.exists(streamKey);

  // If we have meta or a stream, the job is "active" (not finished yet)
  if (Object.keys(meta).length === 0 && streamExists === 0) {
    return false;
  }

  const isStreamingJob = meta.streaming === 'true';
  const isQueued = meta.status === 'queued';

  // Adaptive Polling: if not streaming or still in queue, send status and end
  if (!isStreamingJob || (isQueued && streamExists === 0)) {
    await sendSSE(reply, jobId, 'snapshot', {
      content: null,
      status: meta.status || 'queued',
    });
    reply.raw.end();
    return true;
  }

  // Active Streaming Logic
  const historyData = await streamHistory(jobId, redis, reply, lastEventId);

  if (historyData.isCompleted) return true;

  let lastId = historyData.lastId;

  // Main Live Loop
  while (!reply.raw.destroyed) {
    const next = await redis.xread('BLOCK', 10000, 'STREAMS', streamKey, lastId);
    if (reply.raw.destroyed) break;

    const hasData = next && next.length > 0 && next[0][1].length > 0;
    if (!hasData) {
      const stillAlive = await redis.exists(streamKey);
      if (stillAlive === 0) {
        reply.raw.end();
        return true;
      }
      sendKeepAlive(reply);
      continue;
    }

    const entries = next[0][1];
    for (const [id, fields] of entries) {
      lastId = id;
      const dataStr = fields[1];
      const parsed = JSON.parse(dataStr) as StreamEntry;
      const { data: content, ...rest } = parsed;
      const sseData: SSEData = content ? { content, ...rest } : (rest as SSEData);

      const success = await sendSSE(reply, id, parsed.type, sseData);
      if (!success || parsed.type === 'done' || parsed.type === 'error') {
        reply.raw.end();
        return true;
      }
    }
  }

  return true;
}
