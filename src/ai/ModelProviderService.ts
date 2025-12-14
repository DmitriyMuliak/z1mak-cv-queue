import type { Mode } from '../../types/mode';
import { GeminiProvider } from './providers/gemini/GeminiProvider';

export interface ModelProvider {
  generate: (payload: ModelJobPayload) => Promise<string>;
  isRetryableError: (error: unknown) => boolean;
}

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
  private modelProvider: ModelProvider;

  constructor(
    modelProvider: ModelProvider = new GeminiProvider()
  ) {
    this.modelProvider = modelProvider;
  }

  async execute(payload: ModelJobPayload): Promise<ModelJobResult> {
    try {
      const text = await this.modelProvider.generate({
        model: payload.model,
        cvDescription: payload.cvDescription,
        jobDescription: payload.jobDescription,
        mode: payload.mode,
        locale: payload.locale,
      });

      return { text, usedModel: payload.model };
    } catch (error) {
      const retryable = this.modelProvider.isRetryableError(error);
      (error as any).retryable = retryable;
      throw error;
    }
  }
}
