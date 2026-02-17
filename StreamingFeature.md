# Streaming CV Analysis Feature (NDJSON)

## 1. Overview
Впровадження стрімінгу дозволить фронтенду (Next.js) відображати результати аналізу CV поступово, не чекаючи повного завершення роботи AI-моделі (яке може тривати 15-30 секунд). Це значно покращує UX (LCP/Time to Interactive).

## 2. Proposed Architecture

### 2.1 Communication Flow (Sequence)
1. **Client**: Відправляє POST на `/resume/analyze-stream`.
2. **API (Fastify)**:
   - Виконує існуючі перевірки (Lua: RPD, Concurrency, Backpressure).
   - Обирає модель (враховуючи Fallback).
   - Додає Job у BullMQ з параметром `streaming: true`.
   - Підписується на Redis Pub/Sub канал: `stream:{jobId}`.
   - Відкриває HTTP-з'єднання з `Transfer-Encoding: chunked`.
3. **Worker**:
   - Отримує Job, виконує `consumeExecutionLimits`.
   - Викликає `ModelProviderService.executeStream`.
   - Кожен отриманий чанк від Gemini відправляє в Redis: `PUBLISH stream:{jobId} "{"type":"chunk", "data":"..."}"`.
4. **API (Fastify)**:
   - Отримує повідомлення з Pub/Sub.
   - Форматує у NDJSON: `{"text": "..."}
`.
   - Відправляє чанк клієнту.
5. **Worker**:
   - Завершує стрім, записує повний результат у `job:{id}:result` (як зараз).
   - Відправляє фінальний сигнал: `PUBLISH stream:{jobId} "{"type":"done"}"`.
6. **API (Fastify)**:
   - Отримує `done`, відписується від каналу, закриває HTTP-з'єднання.

## 3. Detailed Components Changes

### 3.1 Redis Layer
- **Pub/Sub**: Використовується для real-time передачі. Канали мають бути короткоживучими (тільки на час виконання).
- **TTL**: Не потребує додаткового зберігання, оскільки дані передаються "на льоту".

### 3.2 API Layer (Fastify)
- **NDJSON**: Кожен рядок відповіді — це валідний JSON об'єкт, що закінчується символом нового рядка `
`.
- **Connection Management**: Потрібен механізм очищення (unsubscribe) у разі, якщо клієнт розірвав з'єднання (AbortController/onClose).

### 3.3 Worker Layer
- **Stream Provider**: Адаптація `ModelProviderService` для підтримки Async Generators (`for await (const chunk of stream) ...`).
- **Atomic Operations**: Важливо не порушити логіку `returnTokens`. Якщо стрім перервався через помилку провайдера, токени мають повертатися згідно з поточною логікою.

## 4. Why this is Best Practice?

1. **Decoupling**: API та Worker залишаються незалежними. API не чекає на завершення BullMQ Job-а через `job.waitUntilFinished()`, що звільняє ресурси.
2. **Resilience**: Навіть якщо стрімінг-з'єднання обірветься, Worker доведе роботу до кінця і результат буде збережений в БД (завдяки поточному механізму Sync Cron).
3. **Consistency**: Використовуються ті ж самі ліміти (RPD/RPM) та механізми Fallback, що вже впроваджені в системі.
4. **Scalability**: Redis Pub/Sub легко масштабується і має мінімальні затримки (sub-millisecond).

## 5. Potential Challenges
- **Mid-stream Failures**: Якщо модель "впала" після того, як ми вже почали стрімити, ми не можемо зробити прозорий Fallback на іншу модель для того ж самого HTTP-запиту. Клієнту буде надіслано об'єкт помилки.
- **Backpressure**: Якщо клієнт повільно читає стрім, а Worker генерує швидко, чанки будуть накопичуватись у пам'яті API-сервера. Fastify автоматично керує цим через stream backpressure.

## 6. Frontend Integration (Next.js)
Фронтенд повинен використовувати `fetch` з обробкою `ReadableStream`:
```typescript
const response = await fetch('/api/resume/analyze-stream', { ... });
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Parse NDJSON and update state
}
```
