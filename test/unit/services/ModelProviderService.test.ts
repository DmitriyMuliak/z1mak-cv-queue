import { describe, it, expect, vi } from 'vitest';
import {
  ModelProviderService,
  type ModelProvider,
} from '../../../src/ai/ModelProviderService';
import type { Mode } from '../../../src/types/mode';

interface RetryableError extends Error {
  retryable?: boolean;
}

const mockMode: Mode = {
  evaluationMode: 'general',
  domain: 'it',
  depth: 'standard',
};

describe('ModelProviderService', () => {
  const mockPayload = {
    model: 'gemini-1.5-flash',
    cvDescription: 'test cv',
    jobDescription: 'test job',
    mode: mockMode,
    locale: 'en',
  };

  it('should attach retryable flag to errors in execute()', async () => {
    const error = new Error('Provider down') as RetryableError;
    const mockProvider: ModelProvider = {
      generate: vi.fn().mockRejectedValue(error),
      generateStream: vi.fn(),
      isRetryableError: vi.fn().mockReturnValue(true),
    };

    const service = new ModelProviderService(mockProvider);

    await expect(service.execute(mockPayload)).rejects.toThrow('Provider down');
    expect(error.retryable).toBe(true);
    expect(mockProvider.isRetryableError).toHaveBeenCalledWith(error);
  });

  it('should attach retryable flag to errors in executeStream() during iteration', async () => {
    const error = new Error('Stream broken') as RetryableError;

    // An async generator that throws
    async function* faultyGenerator() {
      yield 'chunk 1';
      throw error;
    }

    const mockProvider: ModelProvider = {
      generate: vi.fn(),
      generateStream: vi.fn().mockReturnValue(faultyGenerator()),
      isRetryableError: vi.fn().mockReturnValue(false), // e.g., fatal error
    };

    const service = new ModelProviderService(mockProvider);
    const stream = service.executeStream(mockPayload);

    const chunks: string[] = [];

    try {
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
    } catch (err) {
      const retryableErr = err as RetryableError;
      expect(retryableErr).toBe(error);
      expect(retryableErr.retryable).toBe(false);
    }

    expect(chunks).toEqual(['chunk 1']);
    expect(mockProvider.isRetryableError).toHaveBeenCalledWith(error);
  });

  it('should attach retryable true if provider says so in stream', async () => {
    const error = new Error('Temporary network issue') as RetryableError;

    // eslint-disable-next-line require-yield
    async function* faultyGenerator() {
      throw error;
    }

    const mockProvider: ModelProvider = {
      generate: vi.fn(),
      generateStream: vi.fn().mockReturnValue(faultyGenerator()),
      isRetryableError: vi.fn().mockReturnValue(true),
    };

    const service = new ModelProviderService(mockProvider);
    const stream = service.executeStream(mockPayload);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
      for await (const _ of stream) {
      }
    } catch (err) {
      expect((err as RetryableError).retryable).toBe(true);
    }
  });
});
