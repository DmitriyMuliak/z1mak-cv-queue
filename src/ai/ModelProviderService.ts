// services/ai/ModelProviderService.ts

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

/**
 * Сервіс для виконання завдань AI. 
 * Виконує запит лише з однією обраною моделлю. 
 * Логіка retry та fallback між моделями винесена в API-шар та BullMQ.
 */
export class ModelProviderService {
  private geminiProvider: GeminiProvider;

  constructor(geminiProvider = new GeminiProvider()) {
    this.geminiProvider = geminiProvider;
  }

  /**
   * Виконує запит до AI-моделі.
   * * @param payload Дані завдання, включаючи обрану модель.
   * @returns Результат роботи моделі.
   * @throws Помилка, яка може бути retryable (429, 5xx) або не-retryable (4xx).
   */
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
      // 1. Визначаємо тип помилки
      const isRetryable = this.isRetryableError(error);
      
      // 2. Додаємо прапорець retryable до винятку для керування BullMQ
      if (isRetryable) {
        (error as any).retryable = true;
      }
      
      // 3. Кидаємо виняток. BullMQ вирішить, повторювати чи завершувати.
      throw error;
    }
  }

  // --- Приватні допоміжні методи ---

  private isRetryableError(error: unknown): boolean {
    const status = this.extractStatus(error);
    // 429 (Too Many Requests) та 5xx (Server Errors) вважаються retryable
    return status === 429 || (typeof status === 'number' && status >= 500);
  }

  private extractStatus(error: unknown): number | undefined {
    if (!error) return undefined;
    const maybeObj = error as any;
    // Шукаємо статус у різних полях об'єкта помилки
    if (typeof maybeObj.status === 'number') return maybeObj.status;
    if (typeof maybeObj.code === 'number') return maybeObj.code;
    if (typeof maybeObj?.error?.code === 'number') return maybeObj.error.code;
    if (typeof maybeObj?.response?.status === 'number') return maybeObj.response.status;
    return undefined;
  }
}