export const RETRIABLE_NETWORK_CODES = new Set([
  'ECONNRESET', // Connection reset by peer: The other side (server/proxy) closed the connection unexpectedly.
  'ETIMEDOUT', // Operation timed out: The connection or request took too long.
  'ECONNREFUSED', // Connection refused: The target machine actively refused the connection (e.g., service is down).
  'EHOSTUNREACH', // Host unreachable: No route to the host (e.g., network path is broken).
  'ENETUNREACH', // Network unreachable: The local network is down or misconfigured.
  'EAI_AGAIN', // DNS lookup timed out or temporary failure: A temporary failure in name resolution.
  'UND_ERR_CONNECT_TIMEOUT', // Undici (Node.js fetch) connect timeout: Specifically used by the modern Node.js fetch client.
]);

export const isNetworkError = (error: unknown): boolean => {
  const code = (error as Record<string, unknown>)?.code;
  return typeof code === 'string' && RETRIABLE_NETWORK_CODES.has(code);
};

type UnknownError = Record<string, unknown>;
type UnknownErrorOrUndefined = UnknownError | undefined;

export const extractStatus = (error: unknown): number | undefined => {
  if (!error) return undefined;

  const maybeObj = error as UnknownError;
  if (typeof maybeObj.status === 'number') return maybeObj.status;
  if (typeof maybeObj.code === 'number') return maybeObj.code;
  if (typeof (maybeObj?.error as UnknownError)?.code === 'number') {
    return (maybeObj.error as UnknownError).code as number;
  }
  if (typeof (maybeObj?.response as UnknownError)?.status === 'number') {
    return (maybeObj.response as UnknownError).status as number;
  }

  return undefined;
};

export const extractMessage = (error: unknown): string | undefined => {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return undefined;

  const maybeObj = error as UnknownError;
  if (typeof maybeObj.message === 'string') return maybeObj.message;

  const innerError = maybeObj.error as UnknownErrorOrUndefined;
  if (typeof innerError?.message === 'string') return innerError.message;

  const response = maybeObj.response as UnknownErrorOrUndefined;
  const responseData = response?.data as UnknownErrorOrUndefined;
  const responseError = responseData?.error as UnknownErrorOrUndefined;
  if (typeof responseError?.message === 'string') return responseError.message;

  return undefined;
};

export const isContextTooLong = (message?: string): boolean => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('context too long') ||
    lower.includes('input context is too long') ||
    lower.includes('too large') ||
    lower.includes('exceeds')
  );
};
