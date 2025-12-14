# 🚦 Rate limits, черги та конкуренція

Цей проєкт обмежує навантаження на зовнішній AI‑провайдер і користувачів через три рівні: перевірки в API (Lua), контроль беклогу в API та списання лімітів у воркері. BullMQ використовується без вбудованого rate limiter; замість цього працюють наші Redis‑лічильники й динамічна конкуренція.

## Потік запиту

1) **API (`/resume/analyze`)**  
   - Викликає Lua `combinedCheckAndAcquire` з параметрами `userId`, `model`, `modeType`, тощо.  
   - Перевіряє та резервує:
     - `user:rpd:*` (денна квота користувача),
     - `user:active_jobs` (конкурентність користувача),
     - `model:rpd` (денна квота моделі).
   - Обчислює `maxQueueLength` з урахуванням RPM/RPD та середньої тривалості, інкрементує `queue:waiting:{model}` і відсікає `QUEUE_FULL` при перевищенні.  
   - Додає job у BullMQ.

2) **BullMQ worker (`src/worker.ts`)**  
   - Конкурентність воркера задається при створенні `Worker` (див. `DEFAULT_CONCURRENCY` і динамічне оновлення через Redis канал `configUpdate`).
   - Перед виконанням списує ліміти моделі через Lua `consumeExecutionLimits`:
     - `model:rpm` (хвилинний ліміт),
     - `model:rpd` (денний ліміт).
   - Якщо RPM перевищено — переносить job у `delayed` на TTL ключа RPM; якщо RPD або користувацькі денні ліміти — кидає `UnrecoverableError` (без ретраїв).
   - Після успіху / фінального фейлу: декремент `queue:waiting:{model}`, повернення токенів за потреби, оновлення метаданих/результату.

3) **Cron (`src/cron.ts`)**  
   - `expireStaleJobs`: видаляє завислі waiting/delayed job’и, повертає ліміти й декрементує `queue:waiting:{model}` для неактивних задач старших за SLA. Active job не чіпає, щоб не конфліктувати з живими воркерами.
   - Інші таски: синхронізація лімітів моделей із БД, прибирання сирітських ключів.

## Ключові Lua‑скрипти

- **`combinedCheckAndAcquire.lua`** (API): атомарно перевіряє/резервує user RPD, user concurrency, model RPD. Не списує model RPM/RPD.  
  Виклик у `src/routes/resume/resume.ts`:
  ```ts
  const code = await fastify.redis.combinedCheckAndAcquire(
    [userRpdKey, userActiveKey, modelRpdKey],
    [userDayLimit, concurrencyLimit, dayTtl, CONCURRENCY_TTL_SECONDS, 1, now, jobId, modelRpd, dayTtl]
  );
  ```

- **`consumeExecutionLimits.lua`** (worker): списує `model:rpm` і `model:rpd` перед викликом провайдера. Повертає `ModelRpmExceeded`, `ModelRpdExceeded` або `OK`.  
  Виклик у `src/worker.ts`:
  ```ts
  const consumeCode = await consumeModelLimits(model, { modelRpm, modelRpd });
  if (consumeCode === ConsumeCode.ModelRpmExceeded) moveToDelayed(...);
  if (consumeCode === ConsumeCode.ModelRpdExceeded) throw new UnrecoverableError(...);
  ```

- **`returnTokensAtomic.lua`** (worker): повертає ліміти моделі при фейлах/відкочуванні токенів.

- **`expireStaleJob.lua`** (cron): декрементує `queue:waiting:{model}`, прибирає job із `user:active_jobs`, повертає ліміти користувача, виставляє статуси `failed/expired`.

## Беклог‑ліміт

У API після проходження Lua‑перевірок рахується максимально допустима черга для моделі:
```ts
const maxQueueLength = computeMaxQueueLength(modelRpm, modelRpd, avgSeconds);
const waitingKey = redisKeys.queueWaitingModel(selectedModel);
const waitingCount = await fastify.redis.incr(waitingKey);
if (waitingCount > maxQueueLength) {
  await fastify.redis.decr(waitingKey);
  return reply.status(429).send({ ok: false, error: 'QUEUE_FULL', message: ... });
}
```
Це обмежує кількість задач у системі для моделі, навіть якщо денний ліміт ще не вичерпано.

## Конкурентність воркерів

У `src/worker.ts` створюються два воркери (hard/lite) з власною concurrency:
```ts
const DEFAULT_CONCURRENCY = { hard: 3, lite: 8 };
const workers = {
  lite: createWorker(env.queueLiteName, 'lite', DEFAULT_CONCURRENCY.lite),
  hard: createWorker(env.queueHardName, 'hard', DEFAULT_CONCURRENCY.hard),
};
```
Concurrency може змінюватись динамічно через Redis (`/admin/worker-concurrency`), а `refreshConcurrencyLoop` підхоплює зміни, закриває старий воркер і створює новий з оновленим значенням.

## Поведінка при перевищенні лімітів

- **USER:RPD (API)**: 429 `USER_RPD_LIMIT`, job не додається.  
- **USER:CONCURRENCY (API)**: 429 `CONCURRENCY_LIMIT`, job не додається.  
- **MODEL:RPD (API)**: 429 `MODEL_LIMIT`, job не додається (soft‑gate, списання в воркері).  
- **Queue backlog (API)**: 429 `QUEUE_FULL`, job не додається (лічильник `queue:waiting:{model}` > `maxQueueLength`).  
- **MODEL:RPM (worker)**: `consumeExecutionLimits` повертає `ModelRpmExceeded` → job у `delayed` на TTL `model:rpm`.  
- **MODEL:RPD (worker)**: `ModelRpdExceeded` → фінальний фейл із `UnrecoverableError` (без ретраю).  
- **Provider errors**: retry/фатальність визначає провайдер (Gemini) через `isRetryableError`; фатальні помилки з `retryable=false` перетворюються на `UnrecoverableError`.

## Основні Redis‑ключі та TTL

- `model:rpm:{model}` — хвилинний ліміт моделі. TTL: ~70 c (`MINUTE_TTL`). Списується у воркері, TTL використовується як delay при перевищенні.  
- `model:rpd:{model}` — денний ліміт моделі. TTL: до кінця дня PT (`getSecondsUntilMidnightPT`). Резервується в API, списується у воркері, повертається при фейлах.  
- `user:{userId}:rpd:{type}:{date}` — денний ліміт користувача (hard/lite). TTL: до кінця дня PT. Резерв/списання в API/воркері, повернення у воркері/cron.  
- `user:{userId}:active_jobs` — активні/ожидаючі job користувача. Без TTL; очищається по завершенню/cron.  
- `queue:waiting:{model}` — лічильник беклогу моделі. Без TTL; інкремент у API, декремент у воркері/cron.  
- `job:{jobId}:meta` / `job:{jobId}:result` — метадані та результати job (без TTL за замовчуванням).  
- `CONCURRENCY_TTL_SECONDS` (1860 c) — TTL слота конкурентності в `combinedCheckAndAcquire`.  
- `dayTtl` — `getSecondsUntilMidnightPT()` для всіх денних лімітів/expire.

## Облік виклику провайдера (provider_completed)

Щоб не рефандити модельні токени після успішного зовнішнього виклику, воркер виставляє `provider_completed=false` у `jobMeta` перед `generate()` і `provider_completed=true` після успіху.  
У `failed`/cron повернення токенів виконується лише якщо `provider_completed !== 'true'`.

## Контроль швидкості черги

- **Конкурентність воркерів:** `DEFAULT_CONCURRENCY` для hard/lite, динамічно оновлюється через `/admin/worker-concurrency` і `refreshConcurrencyLoop` (воркер перезапускається з новим concurrency).  
- **Model RPM:** списується у воркері перед викликом; при перевищенні job переводиться в `delayed` на TTL `model:rpm`, тим самим throttle’иться швидкість споживання черги без втрати задач.  
- **Беклог‑ліміт:** `queue:waiting:{model}` + `maxQueueLength` відсікає надлишкові POST у піку.  
Це поєднання задає фактичну швидкість: API обмежує вхідний потік і беклог, воркер/TTL на `model:rpm` вирівнює миттєвий темп викликів до зовнішнього провайдера.

### Як оцінити швидкість обробки

- Середній час обробки job ≈ `T` секунд (реальний середній час виклику моделі). Для орієнтиру: hard ≈ 25 с, lite ≈ 15 с (див. `AVG_SECONDS`).  
- Фактичний темп воркера ≈ `concurrency / T` job/сек на процес; сумарно по всіх воркерах — множити на кількість процесів.  
- Обмеження MODEL:RPM у воркері робить додатковий throttle: якщо `concurrency / T` > `model:rpm`, надлишок піде в `delayed` на TTL RPM.  
- API не дасть наростити чергу понад `maxQueueLength` (залежить від RPM/RPD і середнього часу).  
Тож реальний темп = `min(concurrency/T, model:rpm)` (з поправкою на кількість воркерів), а максимальний беклог ≈ `maxQueueLength` на модель.

## Чому не використовуємо вбудований BullMQ rate limiter

- Нам потрібні окремі ліміти за моделлю та користувачем (RPD/RPM, concurrency), а вбудований лімітер задає один глобальний темп на чергу.  
- Ми робимо відкладення job на TTL `model:rpm` та рефанди токенів при технічних збоях; це точніше контролюється через власні Lua й ключі.  
- Беклог‑ліміт і денні квоти моделі/користувача застосовуються ще в API, до черги; BullMQ лімітер цю бізнес-логіку не врахує.  
- За потреби можна додати BullMQ limiter як грубий глобальний “стопер”, але наразі кастомні ліміти точніше відповідають вимогам.

## Логіка чому система працює саме так

- **API відсікає дорогі помилки користувача** (квоти, конкурентність) і робить лише soft‑gate по денній квоті моделі (RPD): `combinedCheckAndAcquire` перевіряє RPD, але фактичне списання моделі відбувається вже у воркері, тож у піку можемо покласти трохи “зайвих” job до розміру беклог‑буфера. Хвилинний RPM моделі не ріжеться в API.  
- **Воркер контролює миттєву швидкість (RPM) і денний ліміт моделі** там, де видно реальне виконання, і може відкласти/повернути токени.  
- **Беклог‑ліміт** обмежує “хвіст” задач при повільних моделях і захищає від накопичення надлишків між API і воркером.  
- **Cron** прибирає зомбі та повертає ліміти, щоб ключі залишалися консистентними після збоїв.

Ця схема дозволяє масштабувати воркери (змінюючи concurrency) без ризику перебити зовнішні ліміти: кожне завдання проходить модельні ліміти на вході й перед виконанням, а беклог тримає чергу під контролем.
