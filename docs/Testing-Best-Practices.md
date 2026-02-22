# Testing Strategy: Decoupling Tests from Implementation Details

## 1. Поточна проблема (Technical Debt)

Наші тести занадто глибоко інтегровані в деталі реалізації. Будь-яка зміна в інфраструктурі викликає "ефект доміно" у тестах.

### Приклади "протікання":
*   **Redis Structure Leak:** Тести знають, що `XREAD` повертає масив масивів `[stream, [[id, [field, val]]]]`.
*   **HTTP Transport Leak:** Кожен тест вручну налаштовує заголовки авторизації та парсить SSE-рядки.
*   **Brittle State Assertion:** Перевірка успіху через `.includes()` або пошук конкретних Redis ID (`1-0`).

## 2. Шар Абстракції (The Proposal)

Ми впроваджуємо три рівні абстракції, щоб зробити тести "сліпими" до реалізації.

### Шар А: Test Data Builders (Redis/DB)
Замість ручного формування об'єктів для Redis, використовуємо білдери.
*   **Мета:** Приховати структуру `ioredis` та `pg`.
*   **Інструмент:** `RedisMockBuilder`.

### Шар Б: Test Driver (API Client)
Замість прямих викликів `fastify.inject`, використовуємо драйвер, який імітує поведінку Фронтенду.
*   **Мета:** Приховати HTTP-заголовки, методи та SSE-парсинг.
*   **Інструмент:** `ResumeTestDriver`.

### Шар В: Semantic Assertions (Matchers)
Використовуємо кастомні матчери для перевірки бізнес-результатів.
*   **Мета:** Перейти від "масив містить рядок" до "стрім завершився успішно".

---

## 3. План дій (Action Plan)

### Етап 1: Утиліти та Хелпери (Low Hanging Fruit)
1.  **Створити `test/helpers/sse-parser.ts`**:
    *   Перенести туди логіку `sseToArray`.
    *   Додати типізацію для розпарсених подій.
2.  **Створити `test/helpers/redis-mocks.ts`**:
    *   Функція `mockStreamHistory(chunks)`: приймає масив текстів, повертає структуру для `xread`.
    *   Функція `mockJobResult(data)`: формує Hash-структуру для `hgetall`.

### Етап 2: Рефакторинг Юніт-тестів (Routes)
1.  **Створити `ResumeTestDriver`**:
    ```typescript
    const driver = new ResumeTestDriver(fastify);
    const result = await driver.submitResume(payload);
    const events = await driver.getStream(result.jobId);
    ```
2.  **Переписати `test/unit/resume/*.test.ts`**:
    *   Видалити всі `fastify.inject` з тіла тестів.
    *   Видалити всі `JSON.parse` з перевірок SSE.

### Етап 3: Рефакторинг Інтеграційних тестів
1.  **Уніфікувати `rateTestUtils.ts`**:
    *   Замінити розрізнені функції на єдиний `IntegrationTestClient`.
    *   Приховати використання `INTERNAL_KEY` та тестових заголовків всередині клієнта.
2.  **Behavioral Assertions**:
    *   Замінити суворі перевірки Redis ID на перевірку "контенту" (напр. `expect(events).toIncludeText("excellent candidate")`).

### Етап 4: Кастомні матчери Vitest
Додати в `vitest.config.ts` глобальні матчери:
*   `expect(stream).toCompleteSuccessfully()`
*   `expect(stream).toFailWithCode(code)`
*   `expect(job).toBePersistedInDb()`

## 4. Очікуваний результат

Тести стануть декларативними документами, які описують **поведінку**, а не код. 

**Було (Implementation-heavy):**
```typescript
const res = await fastify.inject({ method: 'POST', ... });
const lines = res.body.split('\n');
expect(lines[0]).toContain('event: snapshot');
expect(JSON.parse(lines[0].substring(6)).status).toBe('completed');
```

**Стане (Domain-driven):**
```typescript
const stream = await driver.getStream(jobId);
expect(stream).toEmitSnapshot({ status: 'completed' });
expect(stream).toComplete();
```

Це дозволить нам замінити Redis на іншу базу, або SSE на WebSockets, змінивши лише код Драйвера, при цьому **жоден тест не зламається**.
