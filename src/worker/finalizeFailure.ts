import { UnrecoverableError } from 'bullmq';

export const finalizeFailure = (err: any) => {
  if (err?.retryable === false) {
    // Also can add CODE:errorMessage
    throw new UnrecoverableError(err?.message || 'PROVIDER_FATAL_ERROR');
  }
  throw err;
};
