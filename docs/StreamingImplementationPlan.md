# Implementation Plan: Streaming CV Analysis

This document outlines the steps to implement real-time streaming for AI CV analysis.

## 1. AI Provider Enhancement (`src/ai`)
- **ModelProviderService**: Add `executeStream(params): AsyncIterableIterator<string>`.
- **Gemini Provider**: Implement `generateContentStream` from `@google/genai`.
- **Error Handling**: Map streaming errors to existing error types.
- **Unit Test**: Test that the generator correctly yields text chunks and handles provider errors.

## 2. Worker Logic (`src/worker`)
- **Streaming Detection**: Check `job.data.streaming === true`.
- **Pub/Sub Integration**:
  - For each chunk from `executeStream`, `PUBLISH job:stream:{jobId} JSON.stringify({ type: 'chunk', data: chunk })`.
  - On completion, `PUBLISH job:stream:{jobId} JSON.stringify({ type: 'done' })`.
  - On error, `PUBLISH job:stream:{jobId} JSON.stringify({ type: 'error', code: '...', message: '...' })`.
- **Finalization**: 
  - Collect all chunks into a full string during streaming.
  - Call `finalizeSuccess` with the full string to ensure the result is stored in Redis/DB.
  - Ensure tokens are returned on failure (`finalizeFailure`).

## 3. API Layer (`src/routes/resume`)
- **New Endpoint**: `POST /resume/analyze-stream`.
- **Flow**:
  1. Perform Lua checks (`combinedCheckAndAcquire`).
  2. Select Model (Fallback logic).
  3. Enqueue Job with `{ streaming: true }`.
  4. Create a dedicated Redis subscriber for `job:stream:{jobId}`.
  5. Set headers: `Content-Type: application/x-ndjson`, `Transfer-Encoding: chunked`, `Connection: keep-alive`.
  6. **NDJSON Formatting**: For every message received from Pub/Sub, execute `reply.raw.write(JSON.stringify(msg) + '\n')`.
  7. **Cleanup**: Handle `reply.raw.on('close')` to unsubscribe from Redis and prevent memory leaks.

## 4. Testing Strategy
- **Unit Tests**:
  - `ModelProviderService.executeStream`: Mock Gemini SDK and verify chunk yielding.
  - `Worker`: Verify `PUBLISH` calls when `streaming: true`.
- **E2E / Integration Tests**:
  - `test/integration/streaming.test.ts`: Use `fetch` or `supertest` to call `/resume/analyze-stream`.
  - Verify HTTP headers (`Content-Type: application/x-ndjson`).
  - Verify that the response body contains multiple valid JSON objects, each on a new line.
  - Mock `MockGeminiProvider` to simulate a stream with artificial delays.

## 5. Redis Schema Updates
- **Channel**: `job:stream:{jobId}` (Ephemeral Pub/Sub).
