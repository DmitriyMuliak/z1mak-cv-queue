import type { Mode } from '../../../src/types/mode';
import { extractStatus } from '../../../src/ai/utils/errorUtils';

export class HttpMockGeminiProvider {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.GEMINI_MOCK_URL ?? 'http://mock-gemini:8080') {
    this.baseUrl = baseUrl;
  }

  async generate({
    model,
    cvDescription,
    jobDescription,
    mode,
    locale,
  }: {
    model: string;
    cvDescription: string;
    jobDescription?: string;
    mode: Mode;
    locale: string;
  }): Promise<string> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, cvDescription, jobDescription, mode, locale }),
    });

    if (!res.ok) {
      const err = new Error(`Mock Gemini HTTP error ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }

    const data = (await res.json()) as { text?: string; error?: string };
    if (!data.text) {
      const err = new Error(data.error ?? 'Empty mock response');
      (err as any).status = res.status;
      throw err;
    }

    return data.text;
  }

  async *generateStream(payload: {
    model: string;
    cvDescription: string;
    jobDescription?: string;
    mode: Mode;
    locale: string;
  }): AsyncIterableIterator<string> {
    // For simplicity in mock, we fetch the whole text but yield it in chunks (words)
    // to simulate real streaming behavior for the consumer.
    const text = await this.generate(payload);
    const chunks = text.split(' ');
    for (let i = 0; i < chunks.length; i++) {
      yield chunks[i] + (i === chunks.length - 1 ? '' : ' ');
      // small delay to make it realistic
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  isRetryableError(error: unknown): boolean {
    const status = extractStatus(error);
    if (status !== undefined && status >= 400 && status < 500) return false;
    return true;
  }
}
