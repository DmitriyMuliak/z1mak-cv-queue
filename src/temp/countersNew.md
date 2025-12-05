Я зрозумів, що ви хочете побачити, як модифікувати воркер для повторної перевірки лімітів.

Ось як можна реалізувати **дворівневу перевірку лімітів** (API Route + Worker) у вашому коді.

---

## 🛠️ Модифікація Worker (Re-Acquire Lock)

Для цього ми виносимо логіку `combinedCheckAndAcquire` у **нову функцію** та використовуємо її на початку воркера.

### 1\. Зміни в API Route (Оригінальна логіка)

Ми залишаємо **всю** логіку `combinedCheckAndAcquire` в API Route, але змінюємо її мету.

- **Поточна мета**: Забронювати слот.
- **Нова мета**: Забронювати слот **і** позначити завдання як "доступне до виконання".

**Ключова зміна в API Route (початкова перевірка):**

Після успішного `combinedCheckAndAcquire` вам потрібно **негайно зменшити** лічильники (RPM, RPD), які ви щойно збільшили.

Це здається контрінтуїтивним, але ідея така:

1.  **Fastify** (API Route) **перевіряє**, чи доступний слот (Concurreny + RPM/RPD).
2.  **Якщо доступний**, він **бронює** слот (в `KEYS[5]` — `active_jobs`) та **додає** завдання до черги.
3.  **Fastify (одразу)** **ДЕКРЕМЕНТУЄ** лічильники RPD/RPM, бо фактичне споживання ще не відбулося.
4.  **Worker** (після затримки/retry) **повторно збільшує** лічильники, коли завдання береться до виконання.

Цей підхід перетворює **лічильники RPD/RPM** з "лічильників резервування" на "лічильники споживання", які використовуються лише Worker'ом.

---

### 2\. Зміни в Worker (Нова логіка)

Ми додаємо нову функцію `acquireExecutionLock` на початку воркера.

```typescript
// --- Нова Функція (потрібна у воркері) ---

// Цей LUA-скрипт повинен бути доступний воркеру
// або використовуйте окрему команду Redis для "споживання" лічильників.
// Для простоти припустимо, що worker має доступ до аналогічного методу.

// Worker не перевіряє concurrency, бо слот вже заброньований!
// Worker лише перевіряє та інкрементує лічильники RPD/RPM.
const consumeLimits = async (model: string, userId: string, consumeAmount: number = 1) => {
    // В ідеалі, це має бути АТОМАРНИЙ LUA-скрипт,
    // який тільки INCRBY KEYS[1], KEYS[2], KEYS[3] та EXPIRY/TTL.

    // Для прикладу, використаємо INCRBY:
    const modelRpmKey = redisKeys.modelRpm(model);
    const modelRpdKey = redisKeys.modelRpd(model);
    const userModelRpmKey = redisKeys.userModelRpm(userId, model);
    const userModelRpdKey = redisKeys.userModelRpd(userId, model); // Якщо це ZSET

    // ... тут має бути атомарна перевірка та інкремент
    // з порівнянням лімітів, отриманих з redisKeys.modelLimits(model)

    // Якщо припустити, що ця функція успішно перевіряє та інкрементує RPD/RPM:
    // const success = await fastify.redis.execute_lua_script_for_consumption(...)
    // if (!success) throw new Error("RATE_LIMIT_EXCEEDED_AFTER_RETRY");

    // Оскільки ми не маємо LUA-скрипта тут, приймемо, що Worker використовує
    // ваш оригінальний скрипт, але перевіряє лише RPD/RPM.
    // ...
    return true; // якщо успішно
};


// --- Зміни в тілі Worker ---

const worker = new Worker(
  env.queueName,
  async (job) => {
    const { userId, model, ... } = job.data as any;
    const jobId = job.id as string;

    // 1. Спроба "спожити" ліміти RPD/RPM (знову)
    try {
        // Ми не перевіряємо concurrency, бо завдання вже "забронювало" слот у KEYS[5]
        await consumeLimits(model, userId, 1);
    } catch (e: any) {
        // Якщо ліміти RPD/RPM вичерпані (наприклад, ще до півночі)
        // або модель досягла свого максимуму RPM/RPD.

        // Тут ми не викликаємо removeLock, оскільки завдання піде на retry.
        const attempts = job.opts.attempts ?? 0;
        if (job.attemptsMade < attempts) {
             // Ми не можемо рухати завдання, якщо немає retryable логіки,
             // але ми можемо кинути помилку, щоб BullMQ його відклав.
             throw new Error("RATE_LIMIT_BLOCKED_BY_WORKER");
        }

        // Якщо всі спроби вичерпано, позначаємо як failed і звільняємо concurrency lock
        await redis.hset(redisKeys.jobResult(jobId), {
            status: "failed",
            error: "RATE_LIMIT_EXCEEDED_PERMANENTLY",
            finished_at: new Date().toISOString(),
        });
        await removeLock(userId, jobId);
        return;
    }


    await redis.hset(redisKeys.jobMeta(jobId), { /* ... in_progress */ });

    try {
      // 2. Виконання бізнес-логіки
      const result = await modelProvider.executeWithFallback({ ... });

      // 3. Збереження результату та звільнення Concurrency Lock
      // ... збереження completed
      await removeLock(userId, jobId);

    } catch (err: any) {
      // 4. Обробка помилок
      // ... логіка retry
      if (retryable && job.attemptsMade < attempts) {
        // ... job.moveToDelayed(Date.now() + delayMs);
        return;
      }

      // ... остаточний fail
      // ... збереження failed
      await removeLock(userId, jobId);
    }
  }
);
```

### Висновок про Best Practice:

**Дворівнева перевірка (Two-Tier Check):**

- **API Route**: Використовує **атомарну** операцію для перевірки **можливості виконання** і **резервування слоту Concurrency** (`active_jobs`). Лічильники RPM/RPD **не збільшуються** на цьому етапі.
- **Worker**: При спробі виконання виконує **атомарну** операцію для перевірки **наявності квот** (RPD/RPM) та **збільшення лічильників** ("споживання"). Після завершення (успішного чи остаточно невдалого) **звільняє слот Concurrency**.
