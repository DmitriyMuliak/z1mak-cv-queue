# Frontend Integration: `POST /resume/:id/result-stream`

## Як це працює

Один endpoint повертає все — фінальний результат, активний стрім або стан черги. Окремий pre-check через `/status` перед стрімом не потрібен.

```
POST /resume/{jobId}/result-stream
Authorization: Bearer <token>
Content-Type: application/json

{ "lastEventId": "1234567890-0" }  ← опціонально, для відновлення
```

> Браузерний `EventSource` не підтримує `POST` і кастомні headers. Використовуйте [`@microsoft/fetch-event-source`](https://github.com/Azure/fetch-event-source):
> ```bash
> npm install @microsoft/fetch-event-source
> ```

---

## SSE events — контракт

### `snapshot` — повний поточний стан (замінити буфер)

```ts
{
  content: string | null,   // повний текст на цей момент (null якщо queued)
  status: 'queued' | 'in_progress' | 'completed' | 'failed',
  code?: string,            // присутній при status=failed
  message?: string,         // присутній при status=failed
  error?: string            // сирий error string (legacy, може бути відсутній)
}
```

**Логіка на фронті:** `buffer = data.content`

Коли приходить:
- Job вже завершений у Redis або DB → одразу при підключенні
- Job ще у черзі (`queued`) → одразу при підключенні, потім з'єднання закривається
- Reconnect без `lastEventId` → агрегат усіх чанків до цього моменту

---

### `chunk` — інкрементальний фрагмент (додати до буфера)

```ts
{ content: string }
```

**Логіка на фронті:** `buffer += data.content`

Приходить під час активного стрімінгу (AI генерує відповідь в реальному часі).

---

### `done` — стрім завершено

```ts
{
  status: 'completed' | 'failed',
  usedModel?: string,   // яка AI модель виконала задачу
  finishedAt?: string   // ISO timestamp завершення
}
```

**Логіка на фронті:** завершити відображення, зупинити reconnect логіку.

---

### `error` — помилка стріму

```ts
{
  code: string,       // наприклад 'NOT_FOUND', 'SERVER_ERROR', 'PROVIDER_ERROR'
  message: string,
  retryable?: boolean
}
```

**Логіка на фронті:** якщо `retryable: true` — можна спробувати reconnect. Якщо `false` або відсутній — показати помилку.

---

## Черга (Adaptive Polling)

Якщо job ще у черзі, сервер:
1. Надсилає `snapshot` з `status: "queued"` та `content: null`
2. Включає SSE директиву `retry: 5000` — підказка клієнту чекати 5 секунд перед reconnect
3. Закриває з'єднання

`fetch-event-source` виконає reconnect автоматично через 5 секунд.

---

## `lastEventId` — відновлення після розриву

- При кожному отриманому event зберігайте `ev.id` у `localStorage`/`sessionStorage`
- При наступному підключенні передавайте збережений id у тілі запиту
- Бекенд віддасть пропущені events з цього ID

**Формат:** `lastEventId` повинен бути у форматі Redis stream ID — `<timestamp>-<seq>`, наприклад `1748293810000-0`. Якщо передати інший формат — отримаєте `400 Bad Request`.

**Не передавайте** порожній рядок — лише валідний ID або взагалі без поля.

---

## Повна реалізація

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source';

type JobStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

let buffer = '';

async function connectToStream(jobId: string, token: string) {
  const savedId = localStorage.getItem(`sse_cursor_${jobId}`);

  await fetchEventSource(`${API_URL}/resume/${jobId}/result-stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(savedId ? { lastEventId: savedId } : {}),

    onmessage(ev) {
      // Зберігаємо курсор для відновлення
      if (ev.id && ev.id !== '0') {
        localStorage.setItem(`sse_cursor_${jobId}`, ev.id);
      }

      const data = JSON.parse(ev.data);

      switch (ev.event) {
        case 'snapshot': {
          buffer = data.content ?? '';
          updateUI(buffer, data.status as JobStatus);

          if (data.status === 'failed') {
            showError(data.code ?? 'FAILED', data.message ?? data.error ?? 'Analysis failed');
          }
          break;
        }

        case 'chunk': {
          buffer += data.content ?? '';
          updateUI(buffer, 'in_progress');
          break;
        }

        case 'done': {
          onCompleted({
            status: data.status,
            usedModel: data.usedModel,
            finishedAt: data.finishedAt,
          });
          localStorage.removeItem(`sse_cursor_${jobId}`);
          break;
        }

        case 'error': {
          showError(data.code ?? 'STREAM_ERROR', data.message ?? 'Streaming failed');
          if (data.retryable === false) {
            // Зупинити reconnect логіку fetch-event-source
            throw new Error('NON_RETRYABLE');
          }
          break;
        }
      }
    },

    onerror(err) {
      if (err.message === 'NON_RETRYABLE') throw err; // зупинити retry
      // інакше fetch-event-source сам виконає reconnect
    },
  });
}
```

---

## Таблиця статусів

| `snapshot.status` | Що показати |
|---|---|
| `queued` | "In queue..." — чекати reconnect |
| `in_progress` | Показати накопичений `buffer`, продовжити стрім |
| `completed` | Фінальний результат |
| `failed` | Помилка — читати `code`/`message` зі snapshot або `done` |

---

## HTTP помилки (до SSE з'єднання)

| Код | Причина | Retry? |
|---|---|---|
| `400` | Невалідний `lastEventId` або тіло запиту | Ні (виправити формат) |
| `401` | Прострочений або відсутній токен | Ні (оновити токен) |
| `404` | Job не існує | Ні |
| `429` | Rate limit | Так, через затримку |
| `500` | Серверна помилка | Так (1-2 спроби) |

---

## Порівняння chunk vs snapshot

| | `chunk` | `snapshot` |
|---|---|---|
| Призначення | Дельта | Повний стан |
| Що робить клієнт | `buffer +=` | `buffer =` |
| Коли | Активний стрім (AI генерує) | Reconnect / готовий результат / queued |
