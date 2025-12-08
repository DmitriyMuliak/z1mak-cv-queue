import type { Mode } from '../../types/mode';
import { GeminiProvider } from './providers/GeminiProvider';

export interface ModelJobPayload {
  model: string; // Модель, для якої списано токени
  cvDescription: string;
  jobDescription?: string;
  mode: Mode;
  locale: string;
}

export interface ModelJobResult {
  text: string;
  usedModel: string;
}

export class ModelProviderService {
  private geminiProvider: GeminiProvider;

  constructor(geminiProvider = new GeminiProvider()) {
    this.geminiProvider = geminiProvider;
  }

  async execute(payload: ModelJobPayload): Promise<ModelJobResult> {
    try {
      const text = await this.geminiProvider.generate({
        model: payload.model,
        cvDescription: payload.cvDescription,
        jobDescription: payload.jobDescription,
        mode: payload.mode,
        locale: payload.locale,
      });

      return { text, usedModel: payload.model };
    } catch (error) {
      const isRetryable = this.isRetryableError(error);

      if (isRetryable) {
        (error as any).retryable = true;
      }

      throw error;
    }
  }

  private isRetryableError(error: unknown): boolean {
    const status = this.extractStatus(error);
    return status === 429 || (typeof status === 'number' && status >= 500);
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
