import { FastifyReply } from 'fastify';
import { once } from 'events';

export type SSEEvent = 'chunk' | 'snapshot' | 'done' | 'error';

/**
 * Entry structure as saved by the Worker in Redis Streams
 */
export interface StreamEntry {
  type: SSEEvent;
  data?: string;
  code?: string;
  message?: string;
}

/**
 * Standard SSE payload format for the client
 */
export interface SSEData {
  content?: string;
  status?: string;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Sets required headers for Server-Sent Events
 */
export const setSSEHeaders = (reply: FastifyReply): void => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Transfer-Encoding': 'chunked',
    'X-Accel-Buffering': 'no',
  });
};

/**
 * Formats and writes an SSE message to the underlying stream.
 * Handles backpressure using the 'drain' event.
 */
export const sendSSE = async (
  reply: FastifyReply,
  id: string,
  event: SSEEvent,
  data: SSEData | Record<string, unknown>
): Promise<boolean> => {
  if (reply.raw.destroyed) return false;

  const msg = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const canWrite = reply.raw.write(msg);

  if (!canWrite) {
    await once(reply.raw, 'drain');
  }

  return true;
};

export const sendKeepAlive = (reply: FastifyReply): void => {
  if (!reply.raw.destroyed) {
    reply.raw.write(': keep-alive\n\n');
  }
};
