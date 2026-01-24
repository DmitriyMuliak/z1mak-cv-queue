export type ShutdownHandler = () => Promise<void> | void;

type ShutdownEntry = {
  handler: ShutdownHandler;
  priority: number;
  order: number;
};

// Lower number = executed earlier.
export enum ShutdownPriority {
  FASTIFY = 10,
  WORKER = 20,
  QUEUES = 30,
  CRON = 40,
  REDIS = 50,
  DATABASE = 60,
}

const shutdownEntries: ShutdownEntry[] = [];
let handlerOrder = 0;
let isShuttingDown = false;

export const onShutdown = (handler: ShutdownHandler, priority = 0): void => {
  shutdownEntries.push({ handler, priority, order: handlerOrder });
  handlerOrder += 1;
};

export const triggerShutdown = async (): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const handlers = [...shutdownEntries].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.order - b.order;
  });

  for (const { handler } of handlers) {
    try {
      await handler();
    } catch (err) {
      console.error('[shutdown] handler failed', err);
    }
  }
};
