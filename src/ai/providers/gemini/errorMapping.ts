import { extractMessage, extractStatus, isContextTooLong } from '../../utils/errorUtils';

// Gemini error codes with their documented HTTP mappings
// https://ai.google.dev/gemini-api/docs/troubleshooting
export const GEMINI_ERROR_MAP = {
  INVALID_ARGUMENT: { httpCode: 400, code: 'INVALID_ARGUMENT' },
  FAILED_PRECONDITION: { httpCode: 400, code: 'FAILED_PRECONDITION' },
  PERMISSION_DENIED: { httpCode: 403, code: 'PERMISSION_DENIED' },
  NOT_FOUND: { httpCode: 404, code: 'NOT_FOUND' },
  RESOURCE_EXHAUSTED: { httpCode: 429, code: 'RESOURCE_EXHAUSTED' },
  INTERNAL: { httpCode: 500, code: 'INTERNAL' },
  UNAVAILABLE: { httpCode: 503, code: 'UNAVAILABLE' },
  DEADLINE_EXCEEDED: { httpCode: 504, code: 'DEADLINE_EXCEEDED' },
} as const;

export type GeminiErrorCode = keyof typeof GEMINI_ERROR_MAP;

export const GEMINI_ERROR_MESSAGES = {
  INVALID_ARGUMENT: 'Gemini invalid request',
  FAILED_PRECONDITION: 'Gemini request failed precondition',
  PERMISSION_DENIED: 'Gemini permission denied',
  NOT_FOUND: 'Gemini resource not found',
  RESOURCE_EXHAUSTED: 'Gemini rate limit exceeded',
  INTERNAL: 'Gemini internal error',
  UNAVAILABLE: 'Gemini service unavailable',
  DEADLINE_EXCEEDED: 'Gemini deadline exceeded',
} as const satisfies Record<GeminiErrorCode, string>;

export type GeminiErrorMessage = (typeof GEMINI_ERROR_MESSAGES)[GeminiErrorCode];

export const GEMINI_NOT_RETRIABLE_BY_CODE = {
  [GEMINI_ERROR_MAP.RESOURCE_EXHAUSTED.code]: true,
  [GEMINI_ERROR_MAP.INVALID_ARGUMENT.code]: true,
  [GEMINI_ERROR_MAP.FAILED_PRECONDITION.code]: true,
  [GEMINI_ERROR_MAP.PERMISSION_DENIED.code]: true,
  [GEMINI_ERROR_MAP.NOT_FOUND.code]: true,
};

export const GEMINI_NOT_RETRIABLE_BY_STATUS = {
  [GEMINI_ERROR_MAP.RESOURCE_EXHAUSTED.httpCode]: true,
  [GEMINI_ERROR_MAP.INVALID_ARGUMENT.httpCode]: true,
  [GEMINI_ERROR_MAP.PERMISSION_DENIED.httpCode]: true,
  [GEMINI_ERROR_MAP.NOT_FOUND.httpCode]: true,
};

export const GEMINI_RETRIABLE_BY_STATUS = {
  [GEMINI_ERROR_MAP.INTERNAL.httpCode]: true,
  [GEMINI_ERROR_MAP.UNAVAILABLE.httpCode]: true,
  [GEMINI_ERROR_MAP.DEADLINE_EXCEEDED.httpCode]: true,
};

const GEMINI_ERROR_CONTEXT_TO_LONG_MESSAGE = 'Gemini context too long';

export const extractGeminiErrorCode = (error: unknown): GeminiErrorCode | undefined => {
  const maybeObj = error as any;
  const raw =
    typeof maybeObj?.status === 'string'
      ? maybeObj.status
      : typeof maybeObj?.error?.status === 'string'
        ? maybeObj.error.status
        : typeof maybeObj?.response?.data?.error?.status === 'string'
          ? maybeObj.response.data.error.status
          : undefined;

  if (raw && raw in GEMINI_ERROR_MAP) {
    return raw as GeminiErrorCode;
  }

  return undefined;
};

export const normalizeGeminiError = (error: unknown): Error => {
  const code = extractGeminiErrorCode(error);
  const status =
    extractStatus(error) ?? (code ? GEMINI_ERROR_MAP[code]?.httpCode : undefined);
  const extractedMessage = extractMessage(error);
  const isContextToLongError =
    code === GEMINI_ERROR_MAP['INTERNAL'].code && isContextTooLong(extractedMessage);
  const friendlyMessage = isContextToLongError
    ? GEMINI_ERROR_CONTEXT_TO_LONG_MESSAGE
    : code
      ? GEMINI_ERROR_MESSAGES[code]
      : undefined;

  if (typeof status === 'number') {
    const err = new Error(
      friendlyMessage ??
        extractedMessage ??
        (error as Error)?.message ??
        'Gemini provider error'
    );
    (err as any).status = status;
    return err;
  }

  return error instanceof Error
    ? error
    : new Error(friendlyMessage ?? 'Unknown Gemini provider error');
};
