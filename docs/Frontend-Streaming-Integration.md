# Frontend Integration Guide: Resilient Streaming (SSE)

Цей документ описує актуальний контракт стрімінгу для `POST /resume/:id/result-stream`.

## 1. Базова ідея

Використовуйте один endpoint:

- `POST /resume/:id/result-stream`

Бекенд сам вирішує, що повернути:

- фінальний результат з Redis/DB;
- активний стрім (`chunk`);
- стан черги (`queued`).

Окремий pre-check через `/status` перед стрімом не потрібен.

## 2. Залежності

Браузерний `EventSource` не підтримує `POST` і custom headers, тому використовуйте:

```bash
npm install @microsoft/fetch-event-source
```

Для часткового рендеру JSON під час стріму можна додати:

```bash
npm install json-repair
```

## 3. Запит

- Method: `POST`
- Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
- Body: `{"lastEventId":"..."}` (опціонально, для відновлення після розриву)

## 4. Контракт подій

| Event | Призначення | Поля `data` |
| :-- | :-- | :-- |
| `snapshot` | Поточний стан або фінальний знімок | `content`, `status`, optional `error`, optional `code` |
| `chunk` | Новий фрагмент тексту | `content` |
| `done` | Стрім завершено | `{}` |
| `error` | Помилка стрімінгу/сервера | `code`, `message` |

### Допустимі статуси в `snapshot.status`

- `queued`
- `in_progress`
- `completed`
- `failed`

Важливо:

- `snapshot.status = failed` може прийти без `error`/`code` (наприклад, fallback з DB).
- `snapshot.status = failed` може прийти разом з `error` і `code` (failed-результат у Redis).
- Подія `error` і статус `failed` у `snapshot` це різні канали сигналізації, фронт має підтримувати обидва.

## 5. Рекомендована обробка на фронті

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source';

type JobStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

let fullText = '';

export async function connectToStream(jobId: string, token: string) {
  const lastEventId = localStorage.getItem(`lastId_${jobId}`) ?? undefined;

  await fetchEventSource(`${API_URL}/resume/${jobId}/result-stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ lastEventId }),

    onmessage(ev) {
      if (ev.id) localStorage.setItem(`lastId_${jobId}`, ev.id);
      const data = JSON.parse(ev.data);

      switch (ev.event) {
        case 'snapshot': {
          const status = data.status as JobStatus;
          fullText = data.content ?? '';
          updateUI(fullText, status);

          if (status === 'failed') {
            handleError(
              data.code ?? 'FAILED',
              data.error ?? data.message ?? 'Analysis failed'
            );
          }
          break;
        }

        case 'chunk':
          fullText += data.content ?? '';
          updateUI(fullText, 'in_progress');
          break;

        case 'done':
          onCompleted();
          break;

        case 'error':
          handleError(data.code ?? 'STREAM_ERROR', data.message ?? 'Streaming failed');
          break;
      }
    },

    onerror(err) {
      // fetch-event-source виконує reconnect автоматично
      console.error('Stream connection lost', err);
    },
  });
}
```

## 6. Черга (Adaptive Polling)

Якщо job ще у черзі (`snapshot.status = queued`), сервер надсилає `snapshot` і одразу закриває з'єднання.

Це нормальна поведінка. `fetch-event-source` зробить reconnect автоматично, поки статус не зміниться.

## 7. Відновлення після розриву

- Зберігайте останній `ev.id` у `localStorage` або `sessionStorage`.
- Передавайте його у `lastEventId` при наступному підключенні.
- Бекенд віддасть пропущені події.

## 8. Що оновити у старому фронт-коді

- Замінити `processing` -> `in_progress`.
- Додати обробку `snapshot.status === 'failed'`.
- Читати `snapshot.error` та `snapshot.code` як optional.
