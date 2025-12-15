import { describe, it, expect } from 'vitest';
import {
  GEMINI_ERROR_MAP,
  GEMINI_ERROR_MESSAGES,
  extractGeminiErrorCode,
  normalizeGeminiError,
} from '../../../src/ai/providers/gemini/errorMapping';

describe('gemini error mapping', () => {
  it('extracts error code from nested response', () => {
    const err = { response: { data: { error: { status: 'UNAVAILABLE' } } } };
    expect(extractGeminiErrorCode(err)).toBe('UNAVAILABLE');
  });

  it('normalizes error with status and friendly message', () => {
    const err = { status: 'RESOURCE_EXHAUSTED', message: 'Quota' };
    const normalized = normalizeGeminiError(err);
    expect(normalized).toBeInstanceOf(Error);
    expect((normalized as any).status).toBe(GEMINI_ERROR_MAP.RESOURCE_EXHAUSTED.httpCode);
    expect(normalized.message).toBe(GEMINI_ERROR_MESSAGES.RESOURCE_EXHAUSTED);
  });

  it('returns generic error when status missing', () => {
    const normalized = normalizeGeminiError(new Error('boom'));
    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toBe('boom');
  });
});
