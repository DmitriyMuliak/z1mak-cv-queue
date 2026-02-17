# Frontend Integration: AI Streaming (NDJSON)

This document explains how to integrate the new streaming CV analysis feature into a Next.js (or any web) frontend.

## 1. Endpoint Details

- **URL**: `POST /resume/analyze-stream`
- **Method**: `POST`
- **Headers**: Same as `/analyze` (Auth, etc.)
- **Response Content-Type**: `application/x-ndjson`
- **Transfer-Encoding**: `chunked`

## 2. Response Format (NDJSON)

The response is a stream of JSON objects, each on a new line (`
`). You MUST parse each line independently. You can use Partial JSON library.

### Message Types:

1. **Chunk**: A portion of the AI response.
   ```json
   {"type": "chunk", "data": "{"overallAnalysis": {"}
   ```
2. **Done**: Signal that the stream is successfully finished.
   ```json
   { "type": "done" }
   ```
3. **Error**: Signal that an error occurred mid-stream.
   ```json
   { "type": "error", "code": "AI_PROVIDER_ERROR", "message": "..." }
   ```

## 3. Implementation Example (Next.js/React)

```typescript
async function startStreamingAnalysis(payload: any) {
  const response = await fetch('/api/resume/analyze-stream', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split buffer by newlines
    const lines = buffer.split('
');
    buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        handleMessage(message);
      } catch (e) {
        console.error("Failed to parse NDJSON line", e);
      }
    }
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'chunk':
      // Update UI with partial data (e.g., append to a string)
      console.log("Received chunk:", msg.data);
      break;
    case 'done':
      console.log("Analysis complete");
      break;
    case 'error':
      console.error("Stream error:", msg.message);
      break;
  }
}
```

## 4. Important Notes

- **JSON Repair**: Since the AI returns one large JSON object, individual chunks are NOT valid JSONs. Your UI should either treat the data as raw text until finished or use a library like `json-repair` to parse partial objects.
- **AbortController**: If the user leaves the page, call `abort()` on the `fetch` request. The backend will automatically detect the disconnect and stop the Redis subscription.
