# Frontend Streaming Retry Strategy

This document outlines how the frontend should handle errors and reconnections when consuming the Streaming API (SSE).

## Overview

When using Server-Sent Events (SSE), the connection can be interrupted by network issues, server restarts, or provider timeouts. To ensure a smooth user experience, the frontend must distinguish between **fatal errors** and **temporary glitches**.

**CRITICAL**: The frontend must handle its own low-level network errors (e.g., connection lost, browser timeout) independently. Do not wait for a `retryable` field from the server in these cases, as the server might be unreachable or the connection might drop before an error event can be sent.

## Retriable Errors

The frontend **SHOULD** attempt to reconnect if it encounters the following:

### 1. Network Level Errors (Detected by Browser)
*   **Browser `onerror` event**: When the SSE connection is lost or fails to establish.
*   **ReadyState changes to CLOSED**: If the server closes the connection without a `done` event.
*   **`ECONNRESET` / `ETIMEDOUT`**: Low-level network failures.

### 2. HTTP Status Codes (Initial Request)
*   **500 Internal Server Error**: Temporary server-side glitch (unless message indicates "Context Too Long").
*   **503 Service Unavailable**: Server is overloaded or down for maintenance.
*   **504 Gateway Timeout**: The connection to the provider timed out.

### 3. SSE Event: `error` (Application Level)
If the server manages to send an explicit error event, the `data` field will contain a JSON object with the following structure:

| Field | Type | Description |
| :--- | :--- | :--- |
| `type` | `string` | Always `"error"`. |
| `code` | `string` | Technical error code (e.g., `INTERNAL`, `503`, `ETIMEDOUT`). |
| `message` | `string` | Human-readable error description for debugging. |
| `retryable` | `boolean` | Backend verdict on whether reconnection should be attempted. |

Example payload:
```json
{
  "type": "error",
  "code": "UNAVAILABLE",
  "message": "Gemini service unavailable",
  "retryable": true
}
```
If `retryable` is `true` (or missing for network/5xx errors), you should retry. If `false`, stop immediately.

## Non-Retriable Errors (Fatal)

The frontend **SHOULD NOT** retry if `retryable: false` is present in the error event or for the following:

*   **400 Bad Request / `INVALID_ARGUMENT`**: The request data is malformed.
*   **403 Forbidden / `PERMISSION_DENIED`**: API key issues or insufficient permissions.
*   **404 Not Found**: The Job ID does not exist.
*   **429 Too Many Requests / `RESOURCE_EXHAUSTED`**: User has exceeded their rate limits.
*   **Context Too Long**: The input CV or Job Description is too large for the AI model.

---

## Recommended Retry Implementation

### 1. Exponential Backoff
Do not retry immediately. Increase the delay between attempts to avoid overwhelming the server.
*   Attempt 1: 1s delay
*   Attempt 2: 2s delay
*   Attempt 3: 5s delay
*   Max attempts: 3-5

### 2. Handling Partial Content
Since the backend uses Redis Streams, when you reconnect to the same Job ID, the server will:
1.  Re-send all previously generated chunks stored in Redis.
2.  Continue streaming new chunks as they arrive.
The frontend should clear the existing partial text or handle "de-duplication" if necessary (though the API usually handles the replay).

### 3. User Feedback
*   **Retrying**: Show a subtle indicator (e.g., "Connection lost, retrying...").
*   **Fatal**: Show a prominent error message with an action (e.g., "Text too long. Please shorten your CV").

---

## Example (Pseudo-code)

```javascript
function connectToStream(jobId, attempt = 1) {
  const eventSource = new EventSource(`/api/resume/${jobId}/stream`);

  eventSource.addEventListener('error', (event) => {
    let retryable = true;
    
    if (event.data) {
       const errorData = JSON.parse(event.data);
       retryable = errorData.retryable !== false;
    }

    eventSource.close();
    
    if (retryable && attempt <= MAX_ATTEMPTS) {
      const delay = Math.pow(2, attempt) * 1000;
      setTimeout(() => connectToStream(jobId, attempt + 1), delay);
    } else {
      showErrorMessage("Failed to process request.");
    }
  });
  
  // ... handle messages
}
```
