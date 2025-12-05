Ось консолідована специфікація завдань (Technical Requirements Specification) для AI агента або команди розробки. Вона враховує всі останні зміни архітектури, зміни в структурі БД, логіку вибору моделі на бекенді та специфіку скидання лімітів Google Gemini.

---

1 - СПОЧАТКУ - ознайомся з базовою архітектурою - Architecture.md
2 - потім треба внести зміни спираючись на наступні пункти описані у цьому файлі (Task Specification: AI Job Queue & Rate Limiting Refactor)
3 - ти використати валідаційну схему у fastify api для валідайій.
4 - ти маєш написати тести (виклики Gemini - замокай на просто функцію яка імітує невелику затримку, запити до DB(remote) також замокай)
4.1 - ти маєш написати тести для api fastify (для різних кейсів) базові помилки.
4.2 - ти маєш написати Docker file + docker compose який буде піднімати сервіс redis та цей сервіс.
4.3 - ти маєш написати Тести для lua scripts.
4.4 - ти маєш написати Тести для роботи нашого сервісу тобто fastify api + BullMq + redis. (треба перевірити навантаження 5000 rps) ;

# 📋 Task Specification: AI Job Queue & Rate Limiting Refactor

## 1. 🗄️ Database Schema & Data Modeling

Необхідно оновити структуру бази даних та DTO, щоб відобразити зміну логіки вибору моделі.

**Вимоги:**

1.  **Migration (`job` table):**
    - Перейменувати колонку `model` -> `requested_model` (TEXT, NOT NULL). Це модель, яку система обрала як оптимальну для запиту.
    - Додати колонку `processed_model` (TEXT, NULL). Це модель, яка фактично виконала задачу (після всіх fallback/retry).
2.  **DTO Update:**
    - Видалити `model` із вхідного інтерфейсу `RunAiJobBody` (Front-end більше не контролює вибір моделі).
    - Модель має визначатися виключно на основі об'єкта `payload.mode`.

## 2. 🧠 Domain Logic: Model Selector Service

Створити логіку на стороні API (Fastify), яка детерміновано визначає `primaryModel` та `fallbackModels` на основі бізнес-правил.

**Вимоги:**

1.  **Selector Logic:** Реалізувати сервіс/функцію (наприклад, `resolveModelChain(mode: Mode)`), яка приймає `mode` (evaluationMode, domain, depth) та повертає:
    - `requestedModel`: (string) Назва основної моделі (наприклад, `gemini-2.5-pro`).
    - `fallbackModels`: (string[]) Масив запасних моделей.
2.  **Config:** Конфігурація правил мапінгу має бути гнучкою (код або конфіг-файл), щоб можна було легко змінювати стратегію (наприклад, для "deep" аналізу завжди використовувати Pro, для "lite" — Flash).

## 3. 🛡️ Redis & Rate Limiting (Timezone & Windows)

Переробити логіку Lua-скриптів та ключів Redis, відмовившись від складних ZSET для User RPD та врахувавши часовий пояс Google.

**Вимоги:**

1.  **Timezone Logic (Critical):**
    - Google Gemini ліміти (RPD) скидаються о **00:00 Pacific Time (PT)**.
    - Реалізувати утиліту `getSecondsUntilMidnightPT()`, яка обчислює TTL до наступної півночі саме за Тихоокеанським часом (враховуючи DST, якщо потрібно, або просто фіксований зсув UTC-7/UTC-8).
2.  **Lua Script (`combinedCheckAndAcquire`):**
    - **Model RPM:** Використовувати Counter + TTL 70s (Buffer).
    - **Model RPD:** Використовувати Counter + TTL = `getSecondsUntilMidnightPT()`.
    - **User RPD:** **Спрощення:** Замінити ZSET на простий **Fixed Window Counter** (як у моделей). TTL = `getSecondsUntilMidnightPT()`. Це зекономить пам'ять і спростить логіку, оскільки ми покладаємось на жорсткі ліміти моделей.
    - **Concurrency:** Залишити ZSET (для активних задач) з логікою очищення "зомбі".
3.  **Atomic Flow:** Скрипт має перевіряти Concurrency -> Model Limits -> User Limits і повертати помилку або `OK` (1).

## 4. 🚀 API Layer (Fastify) Flow

Оновити обробник `/run-ai-job` для інтеграції нової логіки.

**Вимоги:**

1.  **Validation:** Прибрати валідацію поля `model` у тілі запиту.
2.  **Resolution:** Викликати `resolveModelChain` на основі `request.body.payload.mode`.
3.  **Fallback FSM (Pre-Enqueue):**
    - Пройти по ланцюжку моделей (`requestedModel` -> `fallbacks`).
    - Для кожної моделі викликати Lua-скрипт `combinedCheckAndAcquire`.
    - Якщо ліміт моделі перевищено — пробувати наступну.
    - Якщо ліміт юзера (RPD/Concurrency) перевищено — відразу повертати 429 (зміна моделі не допоможе).
4.  **Enqueue:**
    - У `job.data` записати: `requestedModel` (визначена система) та `model` (та, що пройшла перевірку лімітів).
    - Записати початковий статус у Redis Meta.

## 5. 👷‍♂️ Worker Layer (Execution & Retry)

Оновити Worker для роботи з новими полями та специфічною логікою повторних спроб.

**Вимоги:**

1.  **Data Handling:** Зчитувати `requestedModel` та `fallbackModels` з `job.data`.
2.  **Smart Retry Strategy:**
    - Ігнорувати стандартний `backoff` BullMQ.
    - Реалізувати ручний контроль:
      - При помилці 429/5xx (Provider Error):
        - Attempt 1: `moveToDelayed` на **10 секунд**.
        - Attempt 2: `moveToDelayed` на **30 секунд**.
        - Attempt 3: Fail job.
3.  **Persistence:**
    - Після успішного виконання записати в Redis Result (і потім в БД) поле `processed_model` (назва моделі, яка фактично повернула результат, це може бути primary або fallback, якщо провайдер підтримав це внутрішньо, або та, на якій зупинився API).
    - Забезпечити гарантоване зняття Concurrency Lock (ZREM) у блоці `finally` (тільки якщо job завершено фінально, success або fail).

---

### ✅ Definition of Done

1.  Міграція БД застосована (`requested_model`, `processed_model`).
2.  Front-end відправляє запит без `model`.
3.  Redis ключі моделей експайряться опівночі за **Pacific Time**.
4.  User RPD реалізовано як простий лічильник (без ZSET/Sliding window overhead).
5.  Воркер робить ретраї через 10с та 30с при помилках Google API.
6.  В БД записується історія: що хотіли запустити (`requested`) і чим обробили (`processed`).
