import { vi } from 'vitest';
import { redisKeys } from '../../src/redis/keys';

export class FakeRedis {
  private metas = new Map<string, any>();
  private results = new Map<string, any>();
  private streams = new Map<string, Array<{ id: string; data: string }>>();
  private existsMap = new Map<string, number>();

  public hgetall = vi.fn(async (key: string) => {
    if (this.results.has(key)) return this.results.get(key);
    if (this.metas.has(key)) return this.metas.get(key);
    return {};
  });

  public exists = vi.fn(async (key: string) => {
    return this.existsMap.get(key) ?? 0;
  });

  public xread = vi.fn(async (...args: any[]) => {
    let key: string;
    let lastId: string;

    if (args[0] === 'BLOCK') {
      key = args[3];
      lastId = args[4];
    } else {
      key = args[1];
      lastId = args[2];
    }

    const entries = this.streams.get(key) || [];
    const newEntries =
      lastId === '0' || !lastId ? entries : entries.filter((e) => e.id > lastId);

    if (newEntries.length === 0) return null;
    return [[key, newEntries.map((e) => [e.id, ['data', e.data]])]];
  });

  public setupActiveJob(jobId: string, status = 'processing') {
    const metaKey = redisKeys.jobMeta(jobId);
    const streamKey = redisKeys.jobStream(jobId);
    this.metas.set(metaKey, { status, streaming: 'true' });

    // For queued jobs, the stream usually doesn't exist yet
    if (status === 'queued') {
      this.existsMap.set(streamKey, 0);
    } else {
      this.existsMap.set(streamKey, 1);
      if (!this.streams.has(streamKey)) this.streams.set(streamKey, []);
    }
  }

  public setupFinishedJob(jobId: string, data: any) {
    const resultKey = redisKeys.jobResult(jobId);
    this.results.set(resultKey, {
      status: 'completed',
      data: JSON.stringify(data),
      finished_at: new Date().toISOString(),
    });
  }

  public pushToStream(jobId: string, type: string, data?: any) {
    const streamKey = redisKeys.jobStream(jobId);
    this.existsMap.set(streamKey, 1); // Stream starts existing once data is pushed
    const entries = this.streams.get(streamKey) || [];
    const id = `${Date.now()}-${entries.length}`;
    const payload = typeof data === 'string' ? { type, data } : { type, ...data };
    entries.push({ id, data: JSON.stringify(payload) });
    this.streams.set(streamKey, entries);
  }
}
