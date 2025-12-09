import { GoogleGenAI } from '@google/genai';
import { SchemaService } from '../../schema/SchemaService';
import type { Mode } from '../../../../types/mode';
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

  private normalizeError(error: unknown): Error {
    const status = this.extractStatus(error);

    if (status === 429) {
      const err = new Error('Gemini rate limit exceeded');
      (err as any).status = 429;
      return err;
    }

    if (status === 503) {
      const err = new Error('Gemini service unavailable');
      (err as any).status = 500;
      return err;
    }

    if (typeof status === 'number') {
      const err = new Error((error as Error)?.message ?? 'Gemini provider error');
      (err as any).status = status;
      return err;
    }

    return error instanceof Error ? error : new Error('Unknown Gemini provider error');
  }

  private extractStatus(error: unknown): number | undefined {
    if (!error) return undefined;

    const maybeObj = error as any;
    if (typeof maybeObj.status === 'number') return maybeObj.status;
    if (typeof maybeObj.code === 'number') return maybeObj.code;
    if (typeof maybeObj?.error?.code === 'number') return maybeObj.error.code;
    if (typeof maybeObj?.response?.status === 'number') return maybeObj.response.status;

    return undefined;
  }
}
