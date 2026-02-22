import { SSEEvent } from '../../src/utils/sse';

export interface ParsedSSEEvent {
  id: string;
  event: SSEEvent;
  data: any;
}

/**
 * Parses a raw SSE response body into an array of typed events.
 */
export const parseSSE = (rawBody: string): ParsedSSEEvent[] => {
  const result: ParsedSSEEvent[] = [];
  if (!rawBody) return result;

  const parts = rawBody.split('\n\n');

  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart || trimmedPart.startsWith(':')) continue;

    const lines = trimmedPart.split('\n');
    let data: any = null;
    let event: SSEEvent = 'chunk';
    let id = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const rawData = line.substring(6).trim();
        try {
          data = rawData ? JSON.parse(rawData) : {};
        } catch {
          data = rawData;
        }
      } else if (line.startsWith('event: ')) {
        event = line.substring(7).trim() as SSEEvent;
      } else if (line.startsWith('id: ')) {
        id = line.substring(4).trim();
      }
    }
    result.push({ id, event, data });
  }

  return result;
};
