import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '../../../src/ai/providers/gemini/GeminiProvider';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateStream', () => {
    it('yields chunks from the stream', async () => {
      const mockStream = (async function* () {
        yield { text: 'chunk 1' };
        yield { text: 'chunk 2' };
      })();

      const generateContentStreamMock = vi.fn().mockResolvedValue(mockStream);

      const mockClient = {
        models: {
          generateContentStream: generateContentStreamMock,
        },
      } as any;

      provider = new GeminiProvider(mockApiKey, mockClient);

      const chunks: string[] = [];
      const generator = provider.generateStream({
        model: 'gemini-1.5-flash',
        cvDescription: 'cv',
        mode: { evaluationMode: 'general', domain: 'common', depth: 'standard' },
        locale: 'en',
      });

      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['chunk 1', 'chunk 2']);
      expect(generateContentStreamMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-1.5-flash',
        })
      );
    });

    it('handles stream errors', async () => {
      const generateContentStreamMock = vi.fn().mockRejectedValue(new Error('API Error'));

      const mockClient = {
        models: {
          generateContentStream: generateContentStreamMock,
        },
      } as any;

      provider = new GeminiProvider(mockApiKey, mockClient);

      const generator = provider.generateStream({
        model: 'gemini-1.5-flash',
        cvDescription: 'cv',
        mode: { evaluationMode: 'general', domain: 'common', depth: 'standard' },
        locale: 'en',
      });

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of generator) {
          // do nothing
        }
      }).rejects.toThrow('API Error');
    });
  });
});
