import { HttpMockGeminiProvider } from './HttpMockGeminiProvider';

/**
 * How the Gemini mock is wired for integration tests:
 * 1) The API reads GEMINI_BASE_URL (in docker-compose.test.yml it points to http://mock-gemini:8080).
 * 2) The mock-gemini service runs at that URL and serves configurable responses.
 * 3) The worker is started with `-r dist/src/mock/registerGeminiMock.js` (see start:worker:mock and the test compose),
 *    which preloads this file and swaps the compiled GeminiProvider export in require.cache
 *    with HttpMockGeminiProvider that calls the mock-gemini HTTP server.
 */
const geminiProviderPath = require.resolve('../ai/providers/gemini/GeminiProvider');
const original = require.cache[geminiProviderPath];
if (original) {
  original.exports = { GeminiProvider: HttpMockGeminiProvider };
} else {
  require.cache[geminiProviderPath] = {
    id: geminiProviderPath,
    filename: geminiProviderPath,
    loaded: true,
    children: [],
    paths: [],
    exports: { GeminiProvider: HttpMockGeminiProvider },
    require,
    path: geminiProviderPath,
    isPreloading: false,
    parent: null,
  } as NodeJS.Module;
}
