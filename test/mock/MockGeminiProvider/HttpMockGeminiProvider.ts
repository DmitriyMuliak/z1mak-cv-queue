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

  isRetryableError(error: unknown): boolean {
    const status = extractStatus(error);
    if (status !== undefined && status >= 400 && status < 500) return false;
    return true;
  }
}
