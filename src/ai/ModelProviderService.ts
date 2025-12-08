import type { Mode } from '../../types/mode';
import { GeminiProvider } from './providers/GeminiProvider';

export interface ModelJobPayload {
  model: string;
  fallbackModels?: string[];
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

  async executeWithFallback(payload: ModelJobPayload): Promise<ModelJobResult> {
    const chain = this.buildChain(payload);
    let lastError: unknown;

    for (const candidateModel of chain) {
      try {
        const text = await this.geminiProvider.generate({
          model: candidateModel,
          cvDescription: payload.cvDescription,
          jobDescription: payload.jobDescription,
          mode: payload.mode,
          locale: payload.locale,
        });

        return { text, usedModel: candidateModel };
      } catch (error) {
        lastError = error;

        if (!this.isRetryableError(error)) {
          throw error;
        }
      }
    }

    const retryableError = new Error('All fallback models failed');
    (retryableError as any).status = this.extractStatus(lastError) ?? 500;
    (retryableError as any).retryable = true;
    throw retryableError;
  }

  private buildChain(payload: ModelJobPayload): string[] {
    const uniq = new Set<string>();
    const chain: string[] = [];

    for (const modelName of [payload.model, ...(payload.fallbackModels ?? [])]) {
      if (modelName && !uniq.has(modelName)) {
        uniq.add(modelName);
        chain.push(modelName);
      }
    }

    return chain;
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
