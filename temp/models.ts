// curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY"
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyDOE2prRy3ilC0OgYentz58D4Vu5F2yt8U"
export const _models = {
  models: [
    {
      name: 'models/embedding-gecko-001',
      version: '001',
      displayName: 'Embedding Gecko',
      description: 'Obtain a distributed representation of a text.',
      inputTokenLimit: 1024,
      outputTokenLimit: 1,
      supportedGenerationMethods: ['embedText', 'countTextTokens'],
    },
    {
      name: 'models/gemini-2.5-flash',
      version: '001',
      displayName: 'Gemini 2.5 Flash',
      description:
        'Stable version of Gemini 2.5 Flash, our mid-size multimodal model that supports up to 1 million tokens, released in June of 2025.',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-2.5-pro',
      version: '2.5',
      displayName: 'Gemini 2.5 Pro',
      description: 'Stable release (June 17th, 2025) of Gemini 2.5 Pro',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-2.0-flash-exp',
      version: '2.0',
      displayName: 'Gemini 2.0 Flash Experimental',
      description: 'Gemini 2.0 Flash Experimental',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'bidiGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-2.0-flash',
      version: '2.0',
      displayName: 'Gemini 2.0 Flash',
      description: 'Gemini 2.0 Flash',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-2.0-flash-001',
      version: '2.0',
      displayName: 'Gemini 2.0 Flash 001',
      description:
        'Stable version of Gemini 2.0 Flash, our fast and versatile multimodal model for scaling across diverse tasks, released in January of 2025.',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-2.0-flash-exp-image-generation',
      version: '2.0',
      displayName: 'Gemini 2.0 Flash (Image Generation) Experimental',
      description: 'Gemini 2.0 Flash (Image Generation) Experimental',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'bidiGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-2.0-flash-lite-001',
      version: '2.0',
      displayName: 'Gemini 2.0 Flash-Lite 001',
      description: 'Stable version of Gemini 2.0 Flash-Lite',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-2.0-flash-lite',
      version: '2.0',
      displayName: 'Gemini 2.0 Flash-Lite',
      description: 'Gemini 2.0 Flash-Lite',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-2.0-flash-lite-preview-02-05',
      version: 'preview-02-05',
      displayName: 'Gemini 2.0 Flash-Lite Preview 02-05',
      description: 'Preview release (February 5th, 2025) of Gemini 2.0 Flash-Lite',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-2.0-flash-lite-preview',
      version: 'preview-02-05',
      displayName: 'Gemini 2.0 Flash-Lite Preview',
      description: 'Preview release (February 5th, 2025) of Gemini 2.0 Flash-Lite',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-exp-1206',
      version: '2.5-exp-03-25',
      displayName: 'Gemini Experimental 1206',
      description: 'Experimental release (March 25th, 2025) of Gemini 2.5 Pro',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-2.5-flash-preview-tts',
      version: 'gemini-2.5-flash-exp-tts-2025-05-19',
      displayName: 'Gemini 2.5 Flash Preview TTS',
      description: 'Gemini 2.5 Flash Preview TTS',
      inputTokenLimit: 8192,
      outputTokenLimit: 16384,
      supportedGenerationMethods: ['countTokens', 'generateContent'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
    },
    {
      name: 'models/gemini-2.5-pro-preview-tts',
      version: 'gemini-2.5-pro-preview-tts-2025-05-19',
      displayName: 'Gemini 2.5 Pro Preview TTS',
      description: 'Gemini 2.5 Pro Preview TTS',
      inputTokenLimit: 8192,
      outputTokenLimit: 16384,
      supportedGenerationMethods: ['countTokens', 'generateContent'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
    },
    {
      name: 'models/gemma-3-1b-it',
      version: '001',
      displayName: 'Gemma 3 1B',
      inputTokenLimit: 32768,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
    {
      name: 'models/gemma-3-4b-it',
      version: '001',
      displayName: 'Gemma 3 4B',
      inputTokenLimit: 32768,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
    {
      name: 'models/gemma-3-12b-it',
      version: '001',
      displayName: 'Gemma 3 12B',
      inputTokenLimit: 32768,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
    {
      name: 'models/gemma-3-27b-it',
      version: '001',
      displayName: 'Gemma 3 27B',
      inputTokenLimit: 131072,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
    {
      name: 'models/gemma-3n-e4b-it',
      version: '001',
      displayName: 'Gemma 3n E4B',
      inputTokenLimit: 8192,
      outputTokenLimit: 2048,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
    {
      name: 'models/gemma-3n-e2b-it',
      version: '001',
      displayName: 'Gemma 3n E2B',
      inputTokenLimit: 8192,
      outputTokenLimit: 2048,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
    {
      name: 'models/gemini-flash-latest',
      version: 'Gemini Flash Latest',
      displayName: 'Gemini Flash Latest',
      description: 'Latest release of Gemini Flash',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-flash-lite-latest',
      version: 'Gemini Flash-Lite Latest',
      displayName: 'Gemini Flash-Lite Latest',
      description: 'Latest release of Gemini Flash-Lite',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-pro-latest',
      version: 'Gemini Pro Latest',
      displayName: 'Gemini Pro Latest',
      description: 'Latest release of Gemini Pro',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-2.5-flash-lite',
      version: '001',
      displayName: 'Gemini 2.5 Flash-Lite',
      description: 'Stable version of Gemini 2.5 Flash-Lite, released in July of 2025',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-2.5-flash-image-preview',
      version: '2.0',
      displayName: 'Nano Banana',
      description: 'Gemini 2.5 Flash Preview Image',
      inputTokenLimit: 32768,
      outputTokenLimit: 32768,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 1,
    },
    {
      name: 'models/gemini-2.5-flash-image',
      version: '2.0',
      displayName: 'Nano Banana',
      description: 'Gemini 2.5 Flash Preview Image',
      inputTokenLimit: 32768,
      outputTokenLimit: 32768,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 1,
    },
    {
      name: 'models/gemini-2.5-flash-preview-09-2025',
      version: 'Gemini 2.5 Flash Preview 09-2025',
      displayName: 'Gemini 2.5 Flash Preview Sep 2025',
      description: 'Gemini 2.5 Flash Preview Sep 2025',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-2.5-flash-lite-preview-09-2025',
      version: '2.5-preview-09-25',
      displayName: 'Gemini 2.5 Flash-Lite Preview Sep 2025',
      description: 'Preview release (Septempber 25th, 2025) of Gemini 2.5 Flash-Lite',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-3-pro-preview',
      version: '3-pro-preview-11-2025',
      displayName: 'Gemini 3 Pro Preview',
      description: 'Gemini 3 Pro Preview',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'createCachedContent',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-3-pro-image-preview',
      version: '3.0',
      displayName: 'Nano Banana Pro',
      description: 'Gemini 3 Pro Image Preview',
      inputTokenLimit: 131072,
      outputTokenLimit: 32768,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 1,
      thinking: true,
    },
    {
      name: 'models/nano-banana-pro-preview',
      version: '3.0',
      displayName: 'Nano Banana Pro',
      description: 'Gemini 3 Pro Image Preview',
      inputTokenLimit: 131072,
      outputTokenLimit: 32768,
      supportedGenerationMethods: [
        'generateContent',
        'countTokens',
        'batchGenerateContent',
      ],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 1,
      thinking: true,
    },
    {
      name: 'models/gemini-robotics-er-1.5-preview',
      version: '1.5-preview',
      displayName: 'Gemini Robotics-ER 1.5 Preview',
      description: 'Gemini Robotics-ER 1.5 Preview',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/gemini-2.5-computer-use-preview-10-2025',
      version: 'Gemini 2.5 Computer Use Preview 10-2025',
      displayName: 'Gemini 2.5 Computer Use Preview 10-2025',
      description: 'Gemini 2.5 Computer Use Preview 10-2025',
      inputTokenLimit: 131072,
      outputTokenLimit: 65536,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
    {
      name: 'models/embedding-001',
      version: '001',
      displayName: 'Embedding 001',
      description: 'Obtain a distributed representation of a text.',
      inputTokenLimit: 2048,
      outputTokenLimit: 1,
      supportedGenerationMethods: ['embedContent'],
    },
    {
      name: 'models/text-embedding-004',
      version: '004',
      displayName: 'Text Embedding 004',
      description: 'Obtain a distributed representation of a text.',
      inputTokenLimit: 2048,
      outputTokenLimit: 1,
      supportedGenerationMethods: ['embedContent'],
    },
    {
      name: 'models/gemini-embedding-exp-03-07',
      version: 'exp-03-07',
      displayName: 'Gemini Embedding Experimental 03-07',
      description: 'Obtain a distributed representation of a text.',
      inputTokenLimit: 8192,
      outputTokenLimit: 1,
      supportedGenerationMethods: ['embedContent', 'countTextTokens', 'countTokens'],
    },
    {
      name: 'models/gemini-embedding-exp',
      version: 'exp-03-07',
      displayName: 'Gemini Embedding Experimental',
      description: 'Obtain a distributed representation of a text.',
      inputTokenLimit: 8192,
      outputTokenLimit: 1,
      supportedGenerationMethods: ['embedContent', 'countTextTokens', 'countTokens'],
    },
    {
      name: 'models/gemini-embedding-001',
      version: '001',
      displayName: 'Gemini Embedding 001',
      description: 'Obtain a distributed representation of a text.',
      inputTokenLimit: 2048,
      outputTokenLimit: 1,
      supportedGenerationMethods: [
        'embedContent',
        'countTextTokens',
        'countTokens',
        'asyncBatchEmbedContent',
      ],
    },
    {
      name: 'models/aqa',
      version: '001',
      displayName: 'Model that performs Attributed Question Answering.',
      description:
        'Model trained to return answers to questions that are grounded in provided sources, along with estimating answerable probability.',
      inputTokenLimit: 7168,
      outputTokenLimit: 1024,
      supportedGenerationMethods: ['generateAnswer'],
      temperature: 0.2,
      topP: 1,
      topK: 40,
    },
    {
      name: 'models/imagen-4.0-generate-preview-06-06',
      version: '01',
      displayName: 'Imagen 4 (Preview)',
      description: 'Vertex served Imagen 4.0 model',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predict'],
    },
    {
      name: 'models/imagen-4.0-ultra-generate-preview-06-06',
      version: '01',
      displayName: 'Imagen 4 Ultra (Preview)',
      description: 'Vertex served Imagen 4.0 ultra model',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predict'],
    },
    {
      name: 'models/imagen-4.0-generate-001',
      version: '001',
      displayName: 'Imagen 4',
      description: 'Vertex served Imagen 4.0 model',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predict'],
    },
    {
      name: 'models/imagen-4.0-ultra-generate-001',
      version: '001',
      displayName: 'Imagen 4 Ultra',
      description: 'Vertex served Imagen 4.0 ultra model',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predict'],
    },
    {
      name: 'models/imagen-4.0-fast-generate-001',
      version: '001',
      displayName: 'Imagen 4 Fast',
      description: 'Vertex served Imagen 4.0 Fast model',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predict'],
    },
    {
      name: 'models/veo-2.0-generate-001',
      version: '2.0',
      displayName: 'Veo 2',
      description:
        'Vertex served Veo 2 model. Access to this model requires billing to be enabled on the associated Google Cloud Platform account. Please visit https://console.cloud.google.com/billing to enable it.',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predictLongRunning'],
    },
    {
      name: 'models/veo-3.0-generate-001',
      version: '3.0',
      displayName: 'Veo 3',
      description: 'Veo 3',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predictLongRunning'],
    },
    {
      name: 'models/veo-3.0-fast-generate-001',
      version: '3.0',
      displayName: 'Veo 3 fast',
      description: 'Veo 3 fast',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predictLongRunning'],
    },
    {
      name: 'models/veo-3.1-generate-preview',
      version: '3.1',
      displayName: 'Veo 3.1',
      description: 'Veo 3.1',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predictLongRunning'],
    },
    {
      name: 'models/veo-3.1-fast-generate-preview',
      version: '3.1',
      displayName: 'Veo 3.1 fast',
      description: 'Veo 3.1 fast',
      inputTokenLimit: 480,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['predictLongRunning'],
    },
    {
      name: 'models/gemini-2.5-flash-native-audio-latest',
      version: 'Gemini 2.5 Flash Native Audio Latest',
      displayName: 'Gemini 2.5 Flash Native Audio Latest',
      description: 'Latest release of Gemini 2.5 Flash Native Audio',
      inputTokenLimit: 131072,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['countTokens', 'bidiGenerateContent'],
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxTemperature: 2,
      thinking: true,
    },
  ],
  nextPageToken: 'Cittb2RlbHMvZ2VtaW5pLTIuNS1mbGFzaC1uYXRpdmUtYXVkaW8tbGF0ZXN0',
};




 ✓ test/unit/gemini/errorMapping.test.ts (3 tests) 6ms
 ✓ test/unit/resume/modelSelection.test.ts (5 tests) 6ms
 ✓ test/unit/services/limitsCache.test.ts (4 tests) 10ms
stdout | test/unit/cron.test.ts > cron logic > syncDbResults scans keys, upserts, and cleans redis
[Cron] syncDbResults processed 1 rows in 7ms

 ✓ test/unit/cron.test.ts (3 tests) 46ms
stdout | test/unit/worker/worker.test.ts > queueEvents failed handler > returns tokens and marks limit errors with limit code on final attempt
[QueueEvents:lite] completed job j1 state=failed attempts=2

stderr | test/unit/worker/worker.test.ts > queueEvents failed handler > returns tokens and marks limit errors with limit code on final attempt
[QueueEvents:lite] failed job j1 state=failed attempts=2/2 reason=USER_RPD_EXCEEDED

stdout | test/unit/worker/worker.test.ts > queueEvents failed handler > skips work on non-final attempts
[QueueEvents:lite] completed job j1 state=waiting attempts=0

stderr | test/unit/worker/worker.test.ts > queueEvents failed handler > skips work on non-final attempts
[QueueEvents:lite] failed job j1 state=waiting attempts=0/2 reason=USER_RPD_EXCEEDED

stdout | test/unit/worker/worker.test.ts > queueEvents failed handler > marks meta-only as failed when grace exceeded
[QueueEvents:lite] completed job j1 state=unknown attempts=0

stderr | test/unit/worker/worker.test.ts > queueEvents failed handler > marks meta-only as failed when grace exceeded
[QueueEvents:lite] failed event but job not found: j1
[QueueEvents:lite] failed job j1 state=missing attempts=0/1 reason=USER_RPD_EXCEEDED

 ❯ test/unit/worker/worker.test.ts (8 tests | 1 failed) 26ms
     ✓ delays job when model RPM exceeded 6ms
     ✓ throws UnrecoverableError when model RPD exceeded 1ms
     ✓ marks tokens consumed when limits are OK 1ms
     ✓ returns tokens and marks limit errors with limit code on final attempt 4ms
     ✓ skips work on non-final attempts 1ms
     × marks meta-only as failed when grace exceeded 9ms
     ✓ wraps non-retryable errors in UnrecoverableError 0ms
     ✓ rethrows retryable errors as-is 0ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/unit/worker/worker.test.ts > queueEvents failed handler > marks meta-only as failed when grace exceeded
AssertionError: expected { status: 'failed', …(3) } to match object { status: 'failed', …(2) }
(1 matching property omitted from actual)

- Expected
+ Received

  {
-   "error": "provider_error",
-   "error_code": "provider_error",
+   "error": "USER_RPD_EXCEEDED",
+   "error_code": "limit",
    "status": "failed",
  }

 ❯ test/unit/worker/worker.test.ts:165:54
    163|     if (handlerPromise) await handlerPromise;
    164| 
    165|     expect(redis.hgetall(redisKeys.jobResult('j1'))).toMatchObject({
       |                                                      ^
    166|       status: 'failed',
    167|       error: 'provider_error',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 22 passed (23)
   Start at  23:19:32
   Duration  869ms (transform 373ms, setup 0ms, import 1.01s, tests 94ms, environment 3ms)

 z1mak@z1maks-MacBook-Pro  ~/projects/z1mak-cv-queue   addTTLtoJobMeta ●  fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const id=\"flash3\"; const r=new Redis(process.env.REDIS_URL,{family:6}); Promise.all([r.hgetall(`model:{id}:limits`), r.hgetall(`job:${id}:result`)]).then(console.log).finally(()=>r.quit());"'
Connecting to fdaa:3b:b102:a7b:5bb:d0a6:889c:2... complete
[ {}, {} ]
 z1mak@z1maks-MacBook-Pro  ~/projects/z1mak-cv-queue   addTTLtoJobMeta ●  fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const id=\"gemini-2.5-flash-lite\"; const r=new Redis(process.env.REDIS_URL,{family:6}); Promise.all([r.hgetall(`model:{id}:limits`), r.hgetall(`job:${id}:result`)]).then(console.log).finally(()=>r.quit());"'
Connecting to fdaa:3b:b102:a7b:5bb:d0a6:889c:2... complete
[ {}, {} ]
 z1mak@z1maks-MacBook-Pro  ~/projects/z1mak-cv-queue   addTTLtoJobMeta ●  fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const id=\"gemini-3-flash-lite\"; const r=new Redis(process.env.REDIS_URL,{family:6}); const key=`model:${id}:limits`; Promise.all([r.hgetall(key), r.hgetall(`job:${id}:result`)]).then(console.log).finally(()=>r.quit());"'

Connecting to fdaa:3b:b102:a7b:5bb:d0a6:889c:2... complete
[ {}, {} ]
 z1mak@z1maks-MacBook-Pro  ~/projects/z1mak-cv-queue   addTTLtoJobMeta ●  fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const id=\"gemini-3-flash-lite\"; const r=new Redis(process.env.REDIS_URL,{family:6}); const key=\"model:\"+id+\":limits\"; Promise.all([r.hgetall(key), r.hgetall(\"job:\"+id+\":result\")]).then(console.log).finally(()=>r.quit());"'

Connecting to fdaa:3b:b102:a7b:5bb:d0a6:889c:2... complete
[ {}, {} ]
 z1mak@z1maks-MacBook-Pro  ~/projects/z1mak-cv-queue   addTTLtoJobMeta ●  fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const r=new Redis(process.env.REDIS_URL,{family:6}); r.smembers(\"models:ids\").then(console.log).finally(()=>r.quit());"'

Connecting to fdaa:3b:b102:a7b:5bb:d0a6:889c:2... complete
[ 'flash3', 'flash', 'flashLite' ]
 z1mak@z1maks-MacBook-Pro  ~/projects/z1mak-cv-queue   addTTLtoJobMeta ●  fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const id=\"flash3\"; const r=new Redis(process.env.REDIS_URL,{family:6}); const key=\"model:\"+id+\":limits\"; Promise.all([r.hgetall(key), r.hgetall(\"job:\"+id+\":result\")]).then(console.log).finally(()=>r.quit());"'

Connecting to fdaa:3b:b102:a7b:5bb:d0a6:889c:2... complete
[
  {
    rpm: '5',
    rpd: '20',
    updated_at: '2025-12-30T16:25:27.092Z',
    api_name: 'gemini-3-flash'
  },
  {}
]
 z1mak@z1maks-MacBook-Pro  ~/projects/z1mak-cv-queue   addTTLtoJobMeta ●  git checkout -b addTestForMetaOnly
Switched to a new branch 'addTestForMetaOnly'
 z1mak@z1maks-MacBook-Pro  ~/projects/z1mak-cv-queue   addTestForMetaOnly ●  curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyDOE2prRy3ilC0OgYentz58D4Vu5F2yt8U"
{
  "models": [
    {
      "name": "models/embedding-gecko-001",
      "version": "001",
      "displayName": "Embedding Gecko",
      "description": "Obtain a distributed representation of a text.",
      "inputTokenLimit": 1024,
      "outputTokenLimit": 1,
      "supportedGenerationMethods": [
        "embedText",
        "countTextTokens"
      ]
    },
    {
      "name": "models/gemini-2.5-flash",
      "version": "001",
      "displayName": "Gemini 2.5 Flash",
      "description": "Stable version of Gemini 2.5 Flash, our mid-size multimodal model that supports up to 1 million tokens, released in June of 2025.",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-2.5-pro",
      "version": "2.5",
      "displayName": "Gemini 2.5 Pro",
      "description": "Stable release (June 17th, 2025) of Gemini 2.5 Pro",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-2.0-flash-exp",
      "version": "2.0",
      "displayName": "Gemini 2.0 Flash Experimental",
      "description": "Gemini 2.0 Flash Experimental",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "bidiGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 40,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-2.0-flash",
      "version": "2.0",
      "displayName": "Gemini 2.0 Flash",
      "description": "Gemini 2.0 Flash",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 40,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-2.0-flash-001",
      "version": "2.0",
      "displayName": "Gemini 2.0 Flash 001",
      "description": "Stable version of Gemini 2.0 Flash, our fast and versatile multimodal model for scaling across diverse tasks, released in January of 2025.",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 40,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-2.0-flash-exp-image-generation",
      "version": "2.0",
      "displayName": "Gemini 2.0 Flash (Image Generation) Experimental",
      "description": "Gemini 2.0 Flash (Image Generation) Experimental",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "bidiGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 40,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-2.0-flash-lite-001",
      "version": "2.0",
      "displayName": "Gemini 2.0 Flash-Lite 001",
      "description": "Stable version of Gemini 2.0 Flash-Lite",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 40,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-2.0-flash-lite",
      "version": "2.0",
      "displayName": "Gemini 2.0 Flash-Lite",
      "description": "Gemini 2.0 Flash-Lite",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 40,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-2.0-flash-lite-preview-02-05",
      "version": "preview-02-05",
      "displayName": "Gemini 2.0 Flash-Lite Preview 02-05",
      "description": "Preview release (February 5th, 2025) of Gemini 2.0 Flash-Lite",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 40,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-2.0-flash-lite-preview",
      "version": "preview-02-05",
      "displayName": "Gemini 2.0 Flash-Lite Preview",
      "description": "Preview release (February 5th, 2025) of Gemini 2.0 Flash-Lite",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 40,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-exp-1206",
      "version": "2.5-exp-03-25",
      "displayName": "Gemini Experimental 1206",
      "description": "Experimental release (March 25th, 2025) of Gemini 2.5 Pro",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-2.5-flash-preview-tts",
      "version": "gemini-2.5-flash-exp-tts-2025-05-19",
      "displayName": "Gemini 2.5 Flash Preview TTS",
      "description": "Gemini 2.5 Flash Preview TTS",
      "inputTokenLimit": 8192,
      "outputTokenLimit": 16384,
      "supportedGenerationMethods": [
        "countTokens",
        "generateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2
    },
    {
      "name": "models/gemini-2.5-pro-preview-tts",
      "version": "gemini-2.5-pro-preview-tts-2025-05-19",
      "displayName": "Gemini 2.5 Pro Preview TTS",
      "description": "Gemini 2.5 Pro Preview TTS",
      "inputTokenLimit": 8192,
      "outputTokenLimit": 16384,
      "supportedGenerationMethods": [
        "countTokens",
        "generateContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2
    },
    {
      "name": "models/gemma-3-1b-it",
      "version": "001",
      "displayName": "Gemma 3 1B",
      "inputTokenLimit": 32768,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64
    },
    {
      "name": "models/gemma-3-4b-it",
      "version": "001",
      "displayName": "Gemma 3 4B",
      "inputTokenLimit": 32768,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64
    },
    {
      "name": "models/gemma-3-12b-it",
      "version": "001",
      "displayName": "Gemma 3 12B",
      "inputTokenLimit": 32768,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64
    },
    {
      "name": "models/gemma-3-27b-it",
      "version": "001",
      "displayName": "Gemma 3 27B",
      "inputTokenLimit": 131072,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64
    },
    {
      "name": "models/gemma-3n-e4b-it",
      "version": "001",
      "displayName": "Gemma 3n E4B",
      "inputTokenLimit": 8192,
      "outputTokenLimit": 2048,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64
    },
    {
      "name": "models/gemma-3n-e2b-it",
      "version": "001",
      "displayName": "Gemma 3n E2B",
      "inputTokenLimit": 8192,
      "outputTokenLimit": 2048,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64
    },
    {
      "name": "models/gemini-flash-latest",
      "version": "Gemini Flash Latest",
      "displayName": "Gemini Flash Latest",
      "description": "Latest release of Gemini Flash",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-flash-lite-latest",
      "version": "Gemini Flash-Lite Latest",
      "displayName": "Gemini Flash-Lite Latest",
      "description": "Latest release of Gemini Flash-Lite",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-pro-latest",
      "version": "Gemini Pro Latest",
      "displayName": "Gemini Pro Latest",
      "description": "Latest release of Gemini Pro",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-2.5-flash-lite",
      "version": "001",
      "displayName": "Gemini 2.5 Flash-Lite",
      "description": "Stable version of Gemini 2.5 Flash-Lite, released in July of 2025",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-2.5-flash-image-preview",
      "version": "2.0",
      "displayName": "Nano Banana",
      "description": "Gemini 2.5 Flash Preview Image",
      "inputTokenLimit": 32768,
      "outputTokenLimit": 32768,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 1
    },
    {
      "name": "models/gemini-2.5-flash-image",
      "version": "2.0",
      "displayName": "Nano Banana",
      "description": "Gemini 2.5 Flash Preview Image",
      "inputTokenLimit": 32768,
      "outputTokenLimit": 32768,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 1
    },
    {
      "name": "models/gemini-2.5-flash-preview-09-2025",
      "version": "Gemini 2.5 Flash Preview 09-2025",
      "displayName": "Gemini 2.5 Flash Preview Sep 2025",
      "description": "Gemini 2.5 Flash Preview Sep 2025",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-2.5-flash-lite-preview-09-2025",
      "version": "2.5-preview-09-25",
      "displayName": "Gemini 2.5 Flash-Lite Preview Sep 2025",
      "description": "Preview release (Septempber 25th, 2025) of Gemini 2.5 Flash-Lite",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-3-pro-preview",
      "version": "3-pro-preview-11-2025",
      "displayName": "Gemini 3 Pro Preview",
      "description": "Gemini 3 Pro Preview",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-3-flash-preview",
      "version": "3-flash-preview-12-2025",
      "displayName": "Gemini 3 Flash Preview",
      "description": "Gemini 3 Flash Preview",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-3-pro-image-preview",
      "version": "3.0",
      "displayName": "Nano Banana Pro",
      "description": "Gemini 3 Pro Image Preview",
      "inputTokenLimit": 131072,
      "outputTokenLimit": 32768,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 1,
      "thinking": true
    },
    {
      "name": "models/nano-banana-pro-preview",
      "version": "3.0",
      "displayName": "Nano Banana Pro",
      "description": "Gemini 3 Pro Image Preview",
      "inputTokenLimit": 131072,
      "outputTokenLimit": 32768,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens",
        "batchGenerateContent"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 1,
      "thinking": true
    },
    {
      "name": "models/gemini-robotics-er-1.5-preview",
      "version": "1.5-preview",
      "displayName": "Gemini Robotics-ER 1.5 Preview",
      "description": "Gemini Robotics-ER 1.5 Preview",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/gemini-2.5-computer-use-preview-10-2025",
      "version": "Gemini 2.5 Computer Use Preview 10-2025",
      "displayName": "Gemini 2.5 Computer Use Preview 10-2025",
      "description": "Gemini 2.5 Computer Use Preview 10-2025",
      "inputTokenLimit": 131072,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/deep-research-pro-preview-12-2025",
      "version": "deepthink-exp-05-20",
      "displayName": "Deep Research Pro Preview (Dec-12-2025)",
      "description": "Preview release (December 12th, 2025) of Deep Research Pro",
      "inputTokenLimit": 131072,
      "outputTokenLimit": 65536,
      "supportedGenerationMethods": [
        "generateContent",
        "countTokens"
      ],
      "temperature": 1,
      "topP": 0.95,
      "topK": 64,
      "maxTemperature": 2,
      "thinking": true
    },
    {
      "name": "models/embedding-001",
      "version": "001",
      "displayName": "Embedding 001",
      "description": "Obtain a distributed representation of a text.",
      "inputTokenLimit": 2048,
      "outputTokenLimit": 1,
      "supportedGenerationMethods": [
        "embedContent"
      ]
    },
    {
      "name": "models/text-embedding-004",
      "version": "004",
      "displayName": "Text Embedding 004",
      "description": "Obtain a distributed representation of a text.",
      "inputTokenLimit": 2048,
      "outputTokenLimit": 1,
      "supportedGenerationMethods": [
        "embedContent"
      ]
    },
    {
      "name": "models/gemini-embedding-exp-03-07",
      "version": "exp-03-07",
      "displayName": "Gemini Embedding Experimental 03-07",
      "description": "Obtain a distributed representation of a text.",
      "inputTokenLimit": 8192,
      "outputTokenLimit": 1,
      "supportedGenerationMethods": [
        "embedContent",
        "countTextTokens",
        "countTokens"
      ]
    },
    {
      "name": "models/gemini-embedding-exp",
      "version": "exp-03-07",
      "displayName": "Gemini Embedding Experimental",
      "description": "Obtain a distributed representation of a text.",
      "inputTokenLimit": 8192,
      "outputTokenLimit": 1,
      "supportedGenerationMethods": [
        "embedContent",
        "countTextTokens",
        "countTokens"
      ]
    },
    {
      "name": "models/gemini-embedding-001",
      "version": "001",
      "displayName": "Gemini Embedding 001",
      "description": "Obtain a distributed representation of a text.",
      "inputTokenLimit": 2048,
      "outputTokenLimit": 1,
      "supportedGenerationMethods": [
        "embedContent",
        "countTextTokens",
        "countTokens",
        "asyncBatchEmbedContent"
      ]
    },
    {
      "name": "models/aqa",
      "version": "001",
      "displayName": "Model that performs Attributed Question Answering.",
      "description": "Model trained to return answers to questions that are grounded in provided sources, along with estimating answerable probability.",
      "inputTokenLimit": 7168,
      "outputTokenLimit": 1024,
      "supportedGenerationMethods": [
        "generateAnswer"
      ],
      "temperature": 0.2,
      "topP": 1,
      "topK": 40
    },
    {
      "name": "models/imagen-4.0-generate-preview-06-06",
      "version": "01",
      "displayName": "Imagen 4 (Preview)",
      "description": "Vertex served Imagen 4.0 model",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predict"
      ]
    },
    {
      "name": "models/imagen-4.0-ultra-generate-preview-06-06",
      "version": "01",
      "displayName": "Imagen 4 Ultra (Preview)",
      "description": "Vertex served Imagen 4.0 ultra model",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predict"
      ]
    },
    {
      "name": "models/imagen-4.0-generate-001",
      "version": "001",
      "displayName": "Imagen 4",
      "description": "Vertex served Imagen 4.0 model",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predict"
      ]
    },
    {
      "name": "models/imagen-4.0-ultra-generate-001",
      "version": "001",
      "displayName": "Imagen 4 Ultra",
      "description": "Vertex served Imagen 4.0 ultra model",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predict"
      ]
    },
    {
      "name": "models/imagen-4.0-fast-generate-001",
      "version": "001",
      "displayName": "Imagen 4 Fast",
      "description": "Vertex served Imagen 4.0 Fast model",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predict"
      ]
    },
    {
      "name": "models/veo-2.0-generate-001",
      "version": "2.0",
      "displayName": "Veo 2",
      "description": "Vertex served Veo 2 model. Access to this model requires billing to be enabled on the associated Google Cloud Platform account. Please visit https://console.cloud.google.com/billing to enable it.",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predictLongRunning"
      ]
    },
    {
      "name": "models/veo-3.0-generate-001",
      "version": "3.0",
      "displayName": "Veo 3",
      "description": "Veo 3",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predictLongRunning"
      ]
    },
    {
      "name": "models/veo-3.0-fast-generate-001",
      "version": "3.0",
      "displayName": "Veo 3 fast",
      "description": "Veo 3 fast",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predictLongRunning"
      ]
    },
    {
      "name": "models/veo-3.1-generate-preview",
      "version": "3.1",
      "displayName": "Veo 3.1",
      "description": "Veo 3.1",
      "inputTokenLimit": 480,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": [
        "predictLongRunning"
      ]
    }
  ],
  "nextPageToken": "Ch9tb2RlbHMvdmVvLTMuMS1nZW5lcmF0ZS1wcmV2aWV3"
}
 z