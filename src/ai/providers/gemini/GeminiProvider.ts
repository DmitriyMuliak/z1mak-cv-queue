import { GoogleGenAI } from '@google/genai';
import { SchemaService } from '../../schema/SchemaService';
import type { Mode } from '../../../types/mode';
import { extractMessage, extractStatus, isContextTooLong } from '../../utils/errorUtils';
import { buildPromptSettings } from './builders/buildPromptSettings';
import { safetySettings } from './builders/safetySettings';

export interface GeminiRequest {
  model: string;
  cvDescription: string;
  jobDescription?: string;
  mode: Mode;
  locale: string;
}

export class GeminiProvider {
  private client: GoogleGenAI;

  constructor(
    apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY
  ) {
    if (!apiKey) {
      throw new Error('Gemini API key is missing');
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate({
    model,
    cvDescription,
    jobDescription,
    mode,
    locale,
  }: GeminiRequest): Promise<string> {
    const promptSettings = buildPromptSettings({
      cvDescription,
      jobDescription,
      options: { mode, locale },
    });

    const responseSchema = new SchemaService(mode).getGenAiSchema();

    try {
      const result = await this.client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: promptSettings.prompt }],
          },
        ],
        config: {
          systemInstruction: promptSettings.systemInstructions,
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema,
          safetySettings,
        },
      });

      return result.text ?? '';
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  isRetryableError(error: unknown): boolean {
    const status = extractStatus(error);
    const code = this.extractGeminiErrorCode(error);
    const message = extractMessage(error);
    const mappedStatus = status ?? (code ? GEMINI_ERROR_MAP[code]?.httpCode : undefined);

    if (code === GEMINI_ERROR_MAP.RESOURCE_EXHAUSTED.code) return false;
    if (code === GEMINI_ERROR_MAP.INVALID_ARGUMENT.code) return false;
    if (code === GEMINI_ERROR_MAP.FAILED_PRECONDITION.code) return false;
    if (code === GEMINI_ERROR_MAP.PERMISSION_DENIED.code) return false;
    if (code === GEMINI_ERROR_MAP.NOT_FOUND.code) return false;

    if (mappedStatus === GEMINI_ERROR_MAP.RESOURCE_EXHAUSTED.httpCode) return false;
    if (mappedStatus === GEMINI_ERROR_MAP.INVALID_ARGUMENT.httpCode) return false;
    if (mappedStatus === GEMINI_ERROR_MAP.PERMISSION_DENIED.httpCode) return false;
    if (mappedStatus === GEMINI_ERROR_MAP.NOT_FOUND.httpCode) return false;
    if (
      mappedStatus === GEMINI_ERROR_MAP.INTERNAL.httpCode &&
      isContextTooLong(message)
    ) {
      return false;
    }

    if (isContextTooLong(message) && mappedStatus === undefined) {
      return false;
    }

    if (mappedStatus !== undefined && mappedStatus >= 400 && mappedStatus < 500) {
      return false;
    }

    if (
      mappedStatus === GEMINI_ERROR_MAP.INTERNAL.httpCode ||
      mappedStatus === GEMINI_ERROR_MAP.UNAVAILABLE.httpCode ||
      mappedStatus === GEMINI_ERROR_MAP.DEADLINE_EXCEEDED.httpCode
    ) {
      return true;
    }

    return true;
  }

  private normalizeError(error: unknown): Error {
    const code = this.extractGeminiErrorCode(error);
    const status =
      extractStatus(error) ?? (code ? GEMINI_ERROR_MAP[code]?.httpCode : undefined);
    const extractedMessage = extractMessage(error);
    const friendlyMessage =
      (isContextTooLong(extractedMessage) && code === 'INTERNAL'
        ? 'Gemini context too long'
        : undefined) ?? (code ? GEMINI_ERROR_MESSAGES[code] : undefined);

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
  }

  private extractGeminiErrorCode(error: unknown): GeminiErrorCode | undefined {
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
  }
}

// Gemini error codes with their documented HTTP mappings
// https://ai.google.dev/gemini-api/docs/troubleshooting
const GEMINI_ERROR_MAP = {
  INVALID_ARGUMENT: { httpCode: 400, code: 'INVALID_ARGUMENT' },
  FAILED_PRECONDITION: { httpCode: 400, code: 'FAILED_PRECONDITION' },
  PERMISSION_DENIED: { httpCode: 403, code: 'PERMISSION_DENIED' },
  NOT_FOUND: { httpCode: 404, code: 'NOT_FOUND' },
  RESOURCE_EXHAUSTED: { httpCode: 429, code: 'RESOURCE_EXHAUSTED' },
  INTERNAL: { httpCode: 500, code: 'INTERNAL' },
  UNAVAILABLE: { httpCode: 503, code: 'UNAVAILABLE' },
  DEADLINE_EXCEEDED: { httpCode: 504, code: 'DEADLINE_EXCEEDED' },
} as const;

type GeminiErrorCode = keyof typeof GEMINI_ERROR_MAP;
const GEMINI_ERROR_MESSAGES: Record<GeminiErrorCode, string> = {
  INVALID_ARGUMENT: 'Gemini invalid request',
  FAILED_PRECONDITION: 'Gemini request failed precondition',
  PERMISSION_DENIED: 'Gemini permission denied',
  NOT_FOUND: 'Gemini resource not found',
  RESOURCE_EXHAUSTED: 'Gemini rate limit exceeded',
  INTERNAL: 'Gemini internal error',
  UNAVAILABLE: 'Gemini service unavailable',
  DEADLINE_EXCEEDED: 'Gemini deadline exceeded',
};
