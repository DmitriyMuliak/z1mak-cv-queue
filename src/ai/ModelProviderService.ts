import type { Mode } from '../../types/mode';
import { GeminiProvider } from './providers/gemini/GeminiProvider';

export interface ModelJobPayload {
  model: string; // Model tokens were consumed for
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
  private geminiProvider: { generate: GeminiProvider['generate'] };

  constructor(
    geminiProvider: { generate: GeminiProvider['generate'] } = new GeminiProvider()
  ) {
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
      const retryable = this.isRetryableError(error);
      (error as any).retryable = retryable;
      throw error;
    }
  }

  private isRetryableError(error: unknown): boolean {
    const status = this.extractStatus(error);
    const message = this.extractMessage(error);

    // Fatal (do not retry)
    if (status === 429) return false; // external Gemini limit
    if (status === 400 || status === 403 || status === 404) return false;
    if (status === 500 && this.isContextTooLong(message)) return false;
    if (status !== undefined && status >= 400 && status < 500) return false;

    // Retryable
    if (status === 500 || status === 502 || status === 503 || status === 504) return true;

    // Default: try retry if not matched above
    return true;
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

  private extractMessage(error: unknown): string | undefined {
    const maybeObj = error as any;
    if (typeof maybeObj === 'string') return maybeObj;
    if (typeof maybeObj?.message === 'string') return maybeObj.message;
    if (typeof maybeObj?.error?.message === 'string') return maybeObj.error.message;
    if (typeof maybeObj?.response?.data?.error?.message === 'string') {
      return maybeObj.response.data.error.message;
    }
    return undefined;
  }

  private isContextTooLong(message?: string): boolean {
    if (!message) return false;
    const lower = message.toLowerCase();
    return (
      lower.includes('context too long') ||
      lower.includes('input context is too long') ||
      lower.includes('too large') ||
      lower.includes('exceeds') // guard for wording about context overflow
    );
  }
}
