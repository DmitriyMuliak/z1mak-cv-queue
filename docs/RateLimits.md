Цей опис детально розкриває механізм управління навантаженням. Я перекладу його, зберігаючи високий рівень технічної точності, як ви просили.

# 🚦 Rate Limits, Queues, and Concurrency

This project limits the load on the external AI provider and users through three levels: checks in the API (Lua), backlog control in the API, and limit consumption in the worker. BullMQ is used without an integrated rate limiter; instead, we rely on our Redis counters and dynamic concurrency.

## Request Flow

1.  **API (`/resume/analyze`)**
    - Calls the Lua script `combinedCheckAndAcquire` with parameters like `userId`, `model`, `modeType`, etc.
    - Checks and reserves:
      - `user:rpd:*` (User Daily Rate Per Day quota),
      - `user:active_jobs` (User concurrency),
      - `model:rpd` (Model Daily RPD quota).
    - Calculates `maxQueueLength` based on RPM/RPD and average duration, increments `queue:waiting:{model}`, and rejects with `QUEUE_FULL` if exceeded.
    - Adds the job to BullMQ.

2.  **BullMQ worker (`src/worker.ts`)**
    - Worker concurrency is set during `Worker` creation (see `DEFAULT_CONCURRENCY` and dynamic updates via the Redis channel `configUpdate`).
    - Before execution, consumes model limits via the Lua script `consumeExecutionLimits`:
      - `model:rpm` (Rate Per Minute limit),
      - `model:rpd` (Daily RPD limit).
    - If RPM is exceeded $\rightarrow$ job is moved to `delayed` for the duration of the RPM key's TTL; if RPD or user daily limits are exceeded $\rightarrow$ throws `UnrecoverableError` (no retries).
    - Upon success / final failure: decrements `queue:waiting:{model}`, refunds tokens if necessary, updates metadata/result.

3.  **Cron (`src/cron.ts`)**
    - `expireStaleJobs`: removes stuck waiting/delayed jobs, refunds limits, and decrements `queue:waiting:{model}` for inactive tasks older than the SLA. Active jobs are not touched to avoid conflict with live workers.
    - Other tasks: synchronization of model limits with the DB, cleanup of orphan keys.

## Key Lua Scripts

- **`combinedCheckAndAcquire.lua`** (API): Atomically checks/reserves user RPD, user concurrency, and model RPD. It does _not_ consume model RPM/RPD.
  Invocation in `src/routes/resume/resume.ts`:

  ```ts
  const code = await fastify.redis.combinedCheckAndAcquire(
    [userRpdKey, userActiveKey, modelRpdKey],
    [
      userDayLimit,
      concurrencyLimit,
      dayTtl,
      CONCURRENCY_TTL_SECONDS,
      1,
      now,
      jobId,
      modelRpd,
      dayTtl,
    ]
  );
  ```

- **`consumeExecutionLimits.lua`** (worker): Consumes `model:rpm` and `model:rpd` before calling the provider. Returns `ModelRpmExceeded`, `ModelRpdExceeded`, or `OK`.
  Invocation in `src/worker.ts`:

  ```ts
  const consumeCode = await consumeModelLimits(model, { modelRpm, modelRpd });
  if (consumeCode === ConsumeCode.ModelRpmExceeded) moveToDelayed(...);
  if (consumeCode === ConsumeCode.ModelRpdExceeded) throw new UnrecoverableError(...);
  ```

- **`returnTokensAtomic.lua`** (worker): Refunds model limits upon failures/token rollbacks.

- **`expireStaleJob.lua`** (cron): Decrements `queue:waiting:{model}`, removes job from `user:active_jobs`, refunds user limits, and sets `failed/expired` status.

## Backlog Limit

In the API, after passing the Lua checks, the maximum allowed queue length for the model is calculated:

```ts
const maxQueueLength = computeMaxQueueLength(modelRpm, modelRpd, avgSeconds);
const waitingKey = redisKeys.queueWaitingModel(selectedModel);
const waitingCount = await fastify.redis.incr(waitingKey);
if (waitingCount > maxQueueLength) {
  await fastify.redis.decr(waitingKey);
  return reply.status(429).send({ ok: false, error: 'QUEUE_FULL', message: ... });
}
```

This limits the number of tasks in the system for a given model, even if the daily limit has not been exhausted.

## Worker Concurrency

In `src/worker.ts`, two workers (hard/lite) are created, each with its own concurrency:

```ts
const DEFAULT_CONCURRENCY = { hard: 3, lite: 8 };
const workers = {
  lite: createWorker(env.queueLiteName, 'lite', DEFAULT_CONCURRENCY.lite),
  hard: createWorker(env.queueHardName, 'hard', DEFAULT_CONCURRENCY.hard),
};
```

Concurrency can be changed dynamically via Redis (`/admin/worker-concurrency`), and `refreshConcurrencyLoop` picks up the changes, closes the old worker, and creates a new one with the updated value.

## Behavior on Limit Exceeded

- **USER:RPD (API)**: 429 `USER_RPD_LIMIT`, job not added.
- **USER:CONCURRENCY (API)**: 429 `CONCURRENCY_LIMIT`, job not added.
- **MODEL:RPD (API)**: 429 `MODEL_LIMIT`, job not added (soft-gate, consumption is in the worker).
- **Queue backlog (API)**: 429 `QUEUE_FULL`, job not added (`queue:waiting:{model}` counter \> `maxQueueLength`).
- **MODEL:RPM (worker)**: `consumeExecutionLimits` returns `ModelRpmExceeded` $\rightarrow$ job to `delayed` for the `model:rpm` TTL.
- **MODEL:RPD (worker)**: `ModelRpdExceeded` $\rightarrow$ final failure with `UnrecoverableError` (no retry).
- **Provider errors**: retry/fatal nature is determined by the provider (Gemini) via `isRetryableError`; fatal errors with `retryable=false` become `UnrecoverableError`.

## Core Redis Keys and TTLs

- `model:rpm:{model}` — Model's minute limit. TTL: \~70s (`MINUTE_TTL`). Consumed in the worker, TTL used as delay on overage.
- `model:rpd:{model}` — Model's daily limit. TTL: until end of day PT (`getSecondsUntilMidnightPT`). Reserved in API, consumed in worker, refunded on failure.
- `user:{userId}:rpd:{type}:{date}` — User's daily limit (hard/lite). TTL: until end of day PT. Reserved/consumed in API/worker, refunded in worker/cron.
- `user:{userId}:active_jobs` — User's active/waiting jobs. No TTL; cleared upon completion/cron.
- `queue:waiting:{model}` — Model backlog counter. No TTL; incremented in API, decremented in worker/cron.
- `job:{jobId}:meta` / `job:{jobId}:result` — Job metadata and results (no TTL by default).
- `CONCURRENCY_TTL_SECONDS` (1860s) — TTL for the concurrency slot in `combinedCheckAndAcquire`.
- `dayTtl` — `getSecondsUntilMidnightPT()` for all daily limits/expire.

## Provider Invocation Accounting (`provider_completed`)

To avoid refunding model tokens after a successful external call, the worker sets `provider_completed=false` in `jobMeta` before `generate()` and `provider_completed=true` upon success.
Token refunds in `failed`/cron only execute if `provider_completed !== 'true'`.

## Queue Speed Control

- **Worker Concurrency:** `DEFAULT_CONCURRENCY` for hard/lite, dynamically updated via `/admin/worker-concurrency` and `refreshConcurrencyLoop` (worker restarts with new concurrency).
- **Model RPM:** consumed in the worker before invocation; on overage, the job is moved to `delayed` for the duration of the `model:rpm` TTL, thus throttling the consumption rate without losing tasks.
- **Backlog Limit:** `queue:waiting:{model}` + `maxQueueLength` prunes excessive POSTs during peak load.
  This combination dictates the actual speed: the API limits the input stream and backlog, while the worker/TTL on `model:rpm` smooths out the instantaneous rate of calls to the external provider.

### How to Estimate Processing Speed

- Average job processing time $\approx$ $T$ seconds (actual average model call time). For reference: hard $\approx 25$s, lite $\approx 15$s (see `AVG_SECONDS`).
- Actual worker pace $\approx$ $concurrency / T$ jobs/sec per process; multiply by the number of processes for the total.
- The MODEL:RPM limit in the worker adds an additional throttle: if $concurrency / T$ \> $model:rpm$, the excess will go to `delayed` for the RPM TTL.
- The API will not allow the queue to grow beyond `maxQueueLength` (dependent on RPM/RPD and average time).
  Therefore, the real pace $\approx min(concurrency/T, model:rpm)$ (adjusted for the number of workers), and the maximum backlog $\approx maxQueueLength$ per model.

## Why Built-in BullMQ Rate Limiter is Not Used

- We need separate limits per model and per user (RPD/RPM, concurrency), whereas the built-in limiter sets one global pace for the queue.
- We implement job deferral based on `model:rpm` TTL and token refunds on technical failures; this is more precisely controlled through our own Lua scripts and keys.
- Backlog limits and daily quotas for the model/user are applied in the API, before the queue; the BullMQ limiter would not account for this business logic.
- If necessary, the BullMQ limiter could be added as a crude global "stopper," but currently, custom limits better meet the requirements.

## Rationale for this System Design

- **The API filters out costly user errors** (quotas, concurrency) and only applies a soft-gate for the model's daily quota (RPD): `combinedCheckAndAcquire` checks RPD, but actual model consumption happens in the worker, so at peak, we can place a few "extra" jobs up to the backlog buffer size. The model's minute RPM is not cut in the API.
- **The Worker controls the instantaneous speed (RPM) and the model's daily limit** at the point of actual execution, and can defer/refund tokens.
- **The Backlog Limit** restricts the task "tail" for slow models and protects against accumulating excesses between the API and the worker.
- **Cron** cleans up zombies and refunds limits to ensure key consistency after failures.

This scheme allows workers to be scaled (by changing concurrency) without risking exceeding external limits: every task passes model limits at the entry point and before execution, and the backlog keeps the queue under control.
