import { EventEmitter } from 'events';

export type ShutdownHandler = () => Promise<void> | void;

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export const shutdownEmitter = emitter;

let isShuttingDown = false;

export const onShutdown = (handler: ShutdownHandler): void => {
  emitter.on('shutdown', handler);
};

export const triggerShutdown = async (): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const handlers = emitter.listeners('shutdown') as ShutdownHandler[];
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    try {
      await handlers[i]();
    } catch (err) {
      console.error('[shutdown] handler failed', err);
    }
  }
};
