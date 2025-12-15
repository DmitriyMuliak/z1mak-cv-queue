# Future tasks (refactors & tests)

Детальні описи задач можна прочитати у пункті: DETAILED

- **Tests (`test/unit`)**
  - 1 - Винести `fakeRedis, supabaseQueries, supabaseClientMock, createdQueues` у окремі модулі (файли) у папку (`test/mock`).
- **Worker (`src/worker/index.ts`)**
  - 2 - Розбити `handleJob` на дрібні функції (`consumeLimitsIfNeeded`, `executeModel`, `finalizeSuccess`, `finalizeFailure`).
  - 3 - Винести `registerQueueEvents` у окремий модуль (`queueEvents.ts`).
  - 4 - Винести логіку оновлення concurrency у менеджер (`concurrencyManager.ts`).
  - 5 - Додати тести на обробку лімітів, retryable/non-retryable помилки, повернення токенів.

- **Resume route (`src/routes/resume/resume.ts`)**
  - 6 - Винести вибір моделі у `selectAvailableModel()`.
  - 7 - Винести enqueue в `enqueueJob()`.
  - 8 - Винести `computeMaxQueueLength` у утиліту.
  - 9 - Покрити тестами (unit/integration) для різних AcquireCode.

- **Gemini provider**
  - 10 - Винести `normalizeError` та мапи кодів/повідомлень у константи/утиліти.
  - 11 - Додати метрики/час відповіді і тести на мапінг помилок.

- **Документація**
  - 12 - Окремі розділи про ліміти, черги, backpressure, майбутню архітектуру після рефактору.

- **DETAILED**
  🔧 1. worker.ts — Worker Logic (BullMQ)

⚠️ Можливі недоліки / покращення:
Жорстко задана кількість worker-ів (DEFAULT_CONCURRENCY) навіть якщо вони потім динамічно оновлюються. Було б доцільно зчитувати їх з Redis на старті.
Ручне керування provider_completed через Redis — у разі аварій може не гарантувати точну консистентність.
Відсутність метрик або логування результатів виконання задач (наприклад, час виконання, час очікування). (Можна додати)
Бек-офф на retry заданий фіксовано — можливо варто параметризувати delay або адаптувати до типу помилки.
🐞 Критичних багів не виявлено, але:
Якщо jobMeta не містить tokens_consumed, worker зробить повторне consumeExecutionLimits. Це припускає, що jobMeta завжди буде валідним — потенційно слабке місце.
В registerQueueEvents — якщо job відсутній (наприклад, вже видалений), attemptsMade буде 0, але ви все одно продовжуєте логіку. Це варто обробити окремо.
🤖 2. GeminiProvider.ts — AI інтерфейс до Gemini API

⚠️ Можливі покращення:
normalizeError() — досить складна, містить багато if/else; варто розділити логіку або винести мапінг у зовнішній маппер.
📮 3. resume.ts — API маршрут /resume/analyze

Визначення maxQueueLength базується на середньому часі виконання — гнучке обмеження черги.
⚠️ Можливі покращення:
Дуже багато логіки в одному методі POST — рекомендовано розділити на частини: checkLimits(), selectModel(), enqueueJob().
Всі Redis виклики послідовні, можна частково оптимізувати через пайплайнінг (наприклад, зчитування RPD+RPM).
Використання incr/decr на queue:waiting без TTL — може залишити “висячі” значення при падінні API, хоч і покрито cron-ом.
Можна кешувати ліміти моделей на короткий період, щоб зменшити кількість Redis викликів.
🐞 Критичних багів не знайдено, але:
Якщо всі fallback моделі не проходять по лімітах, 429 буде виданий — але API не зазначає які моделі не пройшли. Можна додати список спробаних моделей у відповідь для дебагу.
⏱ 4. cron.ts (судячи з опису в документації, коду як такого немає)

⚠️ Потенційні ризики:
Якщо cron.ts не має ретраїв на рівні синхронізації до DB, а база тимчасово недоступна — можна втратити результати. Добре було б мати логіку “replay” або checkpoint.
SCAN по Redis може стати вузьким місцем при великій кількості job:\*:result, хоча ви обмежуєте це через батчі (200) — цього може бути недостатньо при навантаженнях >50k RPS.
Важливо переконатися, що Redis ключі не залишаються в системі після видалення job з DB (ви їх DEL — це добре).
Ось деталізований аналіз по двох пунктах:

🔨 2. План рефакторингу для покращення модулів
🔁 worker.ts
Ціль: Винести логіку в окремі модулі для кращої тестованості та підтримки.

Розбити handleJob() на:

consumeLimitsIfNeeded(jobMeta, model)
executeModel(jobPayload)
finalizeSuccess(jobId, result)
finalizeFailure(jobId, reason, isRetryable)
Винести registerQueueEvents() у окремий файл queueEvents.ts

Винести refreshConcurrencyLoop() у concurrencyManager.ts

Додати логування часу виконання задачі (start/end timestamp)

Додати try/catch для jobMeta = redis.hgetall(...) — він є критичним

🤖 GeminiProvider.ts
Ціль: Зменшити складність normalizeError() та покращити тестованість.

Винести normalizeError() у errorUtils.ts
Винести мапінг GEMINI_ERROR_MAP, GEMINI_ERROR_MESSAGES у constants.ts
Додати валідацію payload (наприклад, що mode, cvDescription — валідні)
Додати метрики: час відповіді, код помилки
📮 resume.ts
Ціль: Знизити когнітивне навантаження основного handler-а.

Винести логіку вибору моделі у selectAvailableModel()
Винести enqueueJob() в окрему функцію
Винести computeMaxQueueLength() у queueUtils.ts
Замість if (code === X) → map error code → response
const errorResponses = {
[AcquireCode.ConcurrencyExceeded]: { status: 429, error: 'CONCURRENCY_LIMIT' },
[AcquireCode.UserRpdExceeded]: { status: 429, error: 'USER_RPD_LIMIT' },
[AcquireCode.ModelRpdExceeded]: null, // fallback allowed
};
⏱ cron.ts (якщо реалізовано)
Ціль: Гарантувати ідемпотентність та fault recovery

syncToDB():

Використовувати SETNX або LOCK ключ, щоб уникнути паралельних запусків
Зберігати останню оброблену позицію (наприклад, lastSyncedId)
expireStaleJobs():

Логувати кількість очищених задач
Обробляти частково валідні job:\*:meta без result
Рознести крон задачі в окремі файли:

jobSync.ts
jobCleanup.ts
modelLimitsRefresh.ts
Дякую — ось детальна оцінка модуля cron.ts, включно з його сильними сторонами, можливими ризиками та рекомендаціями щодо покращення.

⚠️ Зони для покращення / ризики:

1. Слабкий захист від дублікатних запусків cron-функцій
   Жодна з функцій не має механізму блокування на основі Redis-LOCK. Якщо startCron() викличеться двічі або інстанси запустяться паралельно — можливе подвійне видалення, подвоєні записи до БД і т.п.

🛠 Рішення:
Використати Redis-based lock, наприклад з SETNX або Redlock, при кожному запуску функції.

const lockKey = 'cron:sync:db';
const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 60); // 60s TTL
if (!acquired) return; // Already running 2. scanKeys() без збереження курсору
Ви використовуєте SCAN без шардінгу або збереження прогресу. Якщо Redis ключів >100k, може бути провальна продуктивність або повторне сканування.

🛠 Рішення:

Переходити на SCAN зі збереженням курсору у Redis, або
Працювати з stream або sscan/hscan при надмірних даних
І/або використовувати TTL на job:\*:result, щоб Redis сам очищав старі ключі 3. syncDbResults() має слабкий захист від часткових збоїв
Якщо одна з await redis.hgetall(...) впаде або Redis поверне невалідні ключі — процес може зірвати всю партію.

🛠 Рішення:

Додати try/catch на рівні кожної job, щоб вона не блокувала весь цикл
Винести парсинг meta/result у ізольовану функцію з перевірками 4. Масова обробка ключів без батч-паралелізму
for (const resultKey of slice) обробляється серійно, а не в Promise.all. Це — потенційний вузький канал при великій кількості ключів.

🛠 Рішення: використовувати Promise.allSettled або map + chunked async виконання

5. Немає метрик / логів на виконання часу
   Жодна з функцій не вимірює власну тривалість, що ускладнює продакшн-моніторинг.

🛠 Рішення: логувати початок/кінець або додати Prometheus-compatible таймери

6. expireStaleJobs() – агресивна перевірка кожну хвилину
   Перевірка кожної хвилини до 500 задач у трьох станах може бути надто частою при великій кількості job-ів.

🛠 Рішення:

Адаптивний інтервал: якщо знайдено <10 застарілих задач — збільшити паузу.
Або перевести у distributed cron модель (один інстанс відповідає за це, інші ні).
🧪 Покриття тестами
Функції мають експортовану обгортку \_\_test, що дозволяє покривати unit-тестами основну логіку.

🟢 Це дуже добре, однак:

Доцільно перевіряти з моками Redis/Supabase, що pipeline працює коректно.
Додати тести для пограничних станів (порожній Redis, зіпсовані ключі, відсутні meta
