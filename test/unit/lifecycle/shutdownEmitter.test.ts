import { describe, it, expect, vi } from 'vitest';

const loadEmitter = async () => {
  vi.resetModules();
  return import('../../../src/utils/shutdownEmitter');
};

describe('shutdownEmitter ordering', () => {
  it('runs handlers by priority then registration order', async () => {
    const { onShutdown, triggerShutdown, ShutdownPriority } = await loadEmitter();
    const calls: string[] = [];

    onShutdown(() => {
      calls.push('fastify');
    }, ShutdownPriority.FASTIFY);
    onShutdown(() => {
      calls.push('queueLite');
    }, ShutdownPriority.QUEUES);
    onShutdown(() => {
      calls.push('queueHard');
    }, ShutdownPriority.QUEUES);
    onShutdown(() => {
      calls.push('cron');
    }, ShutdownPriority.CRON);
    onShutdown(() => {
      calls.push('redis');
    }, ShutdownPriority.REDIS);
    onShutdown(() => {
      calls.push('db');
    }, ShutdownPriority.DATABASE);

    await triggerShutdown();

    expect(calls).toEqual(['fastify', 'queueLite', 'queueHard', 'cron', 'redis', 'db']);
  });

  it('ignores repeated shutdown invocations after the first run', async () => {
    const { onShutdown, triggerShutdown } = await loadEmitter();
    const calls: string[] = [];

    onShutdown(() => {
      calls.push('once');
    });

    await triggerShutdown();
    await triggerShutdown();

    expect(calls).toEqual(['once']);
  });
});
