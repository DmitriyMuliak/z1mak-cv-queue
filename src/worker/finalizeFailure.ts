import { UnrecoverableError } from 'bullmq';

export const finalizeFailure = (err: any) => {
  if (err?.retryable === false) {
    throw new UnrecoverableError(err?.message || 'provider_fatal_error');
  }
  throw err;
};
