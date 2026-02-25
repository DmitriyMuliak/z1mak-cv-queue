import { GoogleGenAI } from '@google/genai';
import { SchemaService } from '../../schema/SchemaService';
import type { Mode } from '../../../types/mode';
import {
  extractMessage,
  extractStatus,
  isContextTooLong,
  isNetworkError,
} from '../../utils/errorUtils';
import { buildPromptSettings } from './builders/buildPromptSettings';
import { safetySettings } from './builders/safetySettings';
import {
  GEMINI_ERROR_MAP,
  GEMINI_NOT_RETRIABLE_BY_CODE,
  GEMINI_NOT_RETRIABLE_BY_STATUS,
  GEMINI_RETRIABLE_BY_STATUS,
  extractGeminiErrorCode,
  normalizeGeminiError,
} from './errorMapping';

export interface GeminiRequest {
  model: string;
  cvDescription: string;
  jobDescription?: string;
  mode: Mode;
  locale: string;
}

export class GeminiProvider {
  private client: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY, client?: GoogleGenAI) {
    if (client) {
      this.client = client;
      return;
    }
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
    const started = Date.now();
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
      throw normalizeGeminiError(error);
    } finally {
      const duration = Date.now() - started;
      // Basic metric: duration per request. In production this can be wired to real metrics sink.
      console.info(`[Gemini] model=${model} duration_ms=${duration}`);
    }
  }

  async *generateStream({
    model,
    cvDescription,
    jobDescription,
    mode,
    locale,
  }: GeminiRequest): AsyncIterableIterator<string> {
    const started = Date.now();
    const promptSettings = buildPromptSettings({
      cvDescription,
      jobDescription,
      options: { mode, locale },
    });

    const responseSchema = new SchemaService(mode).getGenAiSchema();

    try {
      const result = await this.client.models.generateContentStream({
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

      for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      throw normalizeGeminiError(error);
    } finally {
      const duration = Date.now() - started;
      console.info(`[Gemini Stream] model=${model} duration_ms=${duration}`);
    }
  }

  isRetryableError(error: unknown): boolean {
    if (isNetworkError(error)) {
      return true;
    }

    const status = extractStatus(error);
    const code = extractGeminiErrorCode(error);
    const message = extractMessage(error);
    const mappedStatus = status ?? (code ? GEMINI_ERROR_MAP[code]?.httpCode : undefined);

    if (GEMINI_NOT_RETRIABLE_BY_CODE[code as keyof typeof GEMINI_NOT_RETRIABLE_BY_CODE]) {
      return false;
    }

    if (
      GEMINI_NOT_RETRIABLE_BY_STATUS[
        mappedStatus as keyof typeof GEMINI_NOT_RETRIABLE_BY_STATUS
      ]
    ) {
      return false;
    }

    if (
      mappedStatus === GEMINI_ERROR_MAP.INTERNAL.httpCode &&
      isContextTooLong(message)
    ) {
      return false;
    }

    if (mappedStatus === undefined && isContextTooLong(message)) {
      return false;
    }

    if (mappedStatus !== undefined && mappedStatus >= 400 && mappedStatus < 500) {
      return false;
    }

    if (
      GEMINI_RETRIABLE_BY_STATUS[mappedStatus as keyof typeof GEMINI_RETRIABLE_BY_STATUS]
    ) {
      return true;
    }

    return true;
  }
}
