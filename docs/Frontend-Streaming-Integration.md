# Frontend Integration Guide: Resilient Streaming (SSE)

Цей документ описує, як інтегрувати клієнтську частину (React/Next.js) з новою архітектурою стрімінгу результатів аналізу CV.

## 1. Основна концепція: Universal Endpoint

Ми використовуємо **один універсальний ендпоїнт** для отримання результатів:
`POST /resume/:id/result-stream`

Вам більше не потрібно окремо перевіряти статус (`/status`) перед підключенням. Ендпоїнт сам визначить, чи потрібно віддати готовий результат з БД, чи почати трансляцію з черги.

## 2. Залежності

Оскільки стандартний браузерний `EventSource` не підтримує метод **POST** та кастомні заголовки (Authorization), необхідно використовувати бібліотеку від Microsoft:

```bash
npm install @microsoft/fetch-event-source
```

Також для відображення структурованого JSON в реальному часі рекомендується:

```bash
npm install json-repair
```

## 3. Налаштування з'єднання

### Параметри запиту:

- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Body:** `{"lastEventId": "..."}` (опціонально, для відновлення стріму)

### Приклад коду:

```typescript
import { fetchEventSource } from '@microsoft/fetch-event-source';

let fullText = '';

const connectToStream = (jobId: string) => {
  const lastId = localStorage.getItem(`lastId_${jobId}`);

  fetchEventSource(`${API_URL}/resume/${jobId}/result-stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ lastEventId: lastId }),

    onmessage(ev) {
      // 1. Зберігаємо ID для відновлення при F5
      if (ev.id) localStorage.setItem(`lastId_${jobId}`, ev.id);

      const data = JSON.parse(ev.data);

      switch (ev.event) {
        case 'snapshot':
          // Повна історія (при F5 або завершеному джобі)
          fullText = data.content || '';
          updateUI(fullText, data.status);
          break;

        case 'chunk':
          // Новий шматочок тексту
          fullText += data.content;
          updateUI(fullText, 'processing');
          break;

        case 'done':
          // Стрім завершено
          console.log('Analysis finished');
          break;

        case 'error':
          // Помилка (напр. NOT_FOUND)
          handleError(data.code, data.message);
          break;
      }
    },

    onerror(err) {
      // Бібліотека автоматично зробить реконект
      console.error('Stream connection lost', err);
    },
  });
};
```

## 4. Типи подій (Event Contract)

| Event          | Опис                                          | Поля в `data`                                             |
| :------------- | :-------------------------------------------- | :-------------------------------------------------------- |
| **`snapshot`** | Поточний стан (історія або готовий результат) | `content` (текст), `status` (queued/processing/completed) |
| **`chunk`**    | Нова частина тексту від AI                    | `content` (лише новий шматок)                             |
| **`done`**     | Технічний сигнал успішного завершення         | `{}`                                                      |
| **`error`**    | Помилка на стороні сервера                    | `code` (напр. NOT_FOUND), `message`                       |

## 5. Обробка черги (Adaptive Polling)

Якщо робота знаходиться в черзі (`status: queued`), сервер надішле snapshot і **негайно розірве з'єднання**. Це зроблено для економії ресурсів.
**Дія фронтенду:** Нічого робити не треба. `fetch-event-source` побачить розрив і автоматично перепідключиться через 5-10 секунд. Цей цикл триватиме, поки робота не перейде в статус `processing`.

## 6. Відображення структурованого JSON

Оскільки AI надсилає JSON частинами, `fullText` часто буде невалідним (незакриті дужки). Щоб рендерити картки та оцінки до завершення стріму:

1.  Використовуйте `json-repair` для "лагодження" `fullText`.
2.  Парсіть результат: `const partialData = JSON.parse(jsonRepair(fullText))`.
3.  Рендеріть UI на основі `partialData`.

## 7. Відновлення після розриву (Resilience)

1.  Завжди зберігайте останній `ev.id` у `localStorage` або `sessionStorage`.
2.  При створенні нового з'єднання (після F5) передавайте цей ID у полі `lastEventId`.
3.  Бекенд автоматично надішле лише ті чанки, які ви пропустили.
