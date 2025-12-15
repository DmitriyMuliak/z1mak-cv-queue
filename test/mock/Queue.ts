import { vi } from "vitest";

export const createdQueues: any[] = [];

export const createQueueMock = () => {
  const Queue = vi.fn().mockImplementation(() => {
    const queue = {
      getJobs: vi.fn(async () => []),
      close: vi.fn(),
    };
    createdQueues.push(queue);
    return queue;
  });
  return { Queue };
};
