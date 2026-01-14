# 🚀 **AI Resume analyzer Service — Queue + Worker + API Backend**

## Folder structure

```text
root
├── src
│   ├── ai
│   ├── config
│   ├── constants
│   ├── cron
│   ├── db
│   ├── plugins
│   ├── redis
│   ├── routes
│   ├── server.ts
│   ├── services
│   ├── types
│   ├── utils
│   └── worker
├── supabase
│   ├── config.toml
│   ├── helpers
│   ├── migrations
│   └── seed.sql
├── test
│   ├── integration
│   ├── mock
│   ├── unit
│   └── utils
├── scripts
│   ├── cleanupStaleJobs.ts
│   ├── createAdminUser.ts
│   └── makeAdminExisting.ts
├── docs
│   ├── Architecture.md
│   ├── RateLimits.md
│   ├── TESTS.md
│   └── Woker.md
├── README.md
├── Dockerfile
├── docker-compose.develop.yml
├── docker-compose.test.yml
├── eslint.config.cjs
├── fly.redis.toml
├── fly.toml
├── package.json
├── tsconfig.build.json
├── tsconfig.json
└── vitest.config.ts
```

This service is the core of the AI analysis execution system.
It processes jobs considering:

- **Model Limits** (RPM / RPD) — enforced by the worker
- **User Limits** (daily RPD) + **Concurrency** — enforced by the API via Lua
- **Model Backpressure** (`queue:waiting` + dynamic `maxQueueLength`)
- **Model Fallback** (prior to enqueue)
- **Retry** (BullMQ-native)
- **Atomic Redis Lua scripts**
- **Durable Job Result State**
- **Batch DB Synchronization**
- **HTTP API** for starting jobs

> **This is NOT a Next.js API.**
> Next.js only proxies requests to this service.

## Local Supabase (Postgres)

- Start local stack: `npm run supabase start` (uses the bundled Supabase CLI).
- Postgres URL for this service: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` (ports match `supabase/config.toml`).
- Only Postgres is used here; Supabase auth/storage are not required.

---

# 📚 Table of Contents

1.  Architecture
2.  Data Flow
3.  Redis Structures
4.  Lua Scripts (Atomic)
5.  HTTP API (Fastify)
6.  Worker Pipeline
7.  Cron Tasks
8.  Health Check
9.  Graceful Shutdown

---

# 🧩 1. Architecture Diagram

```mermaid
flowchart LR

    Client --> Next[Next.js App]
    Next --> API[Jobs API Server]

    API --> Lua[Redis Lua: user RPD + concurrency]
    API --> BP[Backpressure per model]
    Lua --> Redis[(Redis)]
    BP --> Redis

    API --> QueueLite[Queue: lite]
    API --> QueueHard[Queue: hard]

    QueueLite --> Worker[Worker Pool]
    QueueHard --> Worker
    Worker --> Limits[Model RPM/RPD]
    Limits --> Redis
    Worker --> Result[Redis Job Result]

    Result --> Sync[DB Sync Cron + cleanup]
    Sync --> DB[(Database)]
```

---

# 🔄 2. Data Flows

### **1) HTTP API receive job**

- Payload validation, model selection + fallback
- Lua `combinedCheckAndAcquire`: user RPD (per mode) + concurrency lock + model RPD pre-check
- Backpressure: `queue:waiting:{model}` does not exceed dynamic `maxQueueLength` (\~30 min SLA) and is not greater than model RPD
- Write job meta, enqueue into lite/hard queue

### **2) Worker execution**

- Lua `consumeExecutionLimits`: model RPM/RPD (user RPD=0, as it was already deducted in the API)
- If RPM is exceeded — delayed; if RPD is exceeded — fail
- Resolves provider model name from Redis `model:{id}:limits.api_name` (loaded from DB)
- Call AI, record result, release counters/locks

### **3) Cron**

- SCAN `job:*:result` $\rightarrow$ batch upsert to DB. Job meta/result are created with a 24h TTL; after sync we reduce TTL to 5 minutes to keep hot data for clients while DB is the source of truth. Meta-only jobs older than ~35 minutes are persisted as `failed/missing_result` to avoid stuck `in_progress`.
- Cleanup orphan locks
- `expireStaleJobs` (long waiting/delayed $\rightarrow$ expired, release counters; active jobs are handled by BullMQ stalled checks)

### **3) DB sync**

```
Redis Results → Batch Cron → DB
```

### **4) Dynamic Worker Concurrency**

- Current values are read from Redis `config:worker:{lite|hard}:concurrency`.
- Admin can update via `/admin/worker-concurrency`; workers immediately pick up the change via Pub/Sub `config:update`.
- Defaults: `lite=8`, `hard=3` (if keys are absent).
- Worker robustness: stalled detection configured (`stalledInterval=60s`, `lockDuration=60s`, `maxStalledCount=1`) to let BullMQ recycle dead workers instead of cron touching active jobs.

---

# 🗄 3. Redis Structures

### Model Limits

```
model:{model}:limits
  rpm
  rpd
  api_name
```

### Model Catalog

```
models:ids (SET) = list of model ids loaded from DB
```

### User Daily RPD (STRING with TTL)

```
user:{id}:rpd:{lite|hard}:{YYYY-MM-DD} = counter (string)
```

### Concurrency Control

```
user:{id}:active_jobs → ZSET(jobId, expiry_ts)
```

### Job Metadata

```
job:{id}:meta
  user_id
  model
  created_at
  updated_at
  attempts
  mode_type
  requested_model
  processed_model
  status
  TTL: ~24h at creation, then 5m after DB sync
```

### Job Result

```
job:{id}:result
  status
  error
  finished_at
  data
  used_model
  synced_at (after DB sync)
  TTL: ~24h at creation, then 5m after DB sync
```

---

# 🔥 4. Lua Scripts (Summary)

- `combinedCheckAndAcquire`: cleans up zombie locks, checks user RPD + concurrency, sets lock in ZSET, increments user RPD, checks model RPD (without consuming); returns code OK / CONCURRENCY / USER_RPD / MODEL_RPD.
- `consumeExecutionLimits`: atomically checks and consumes model RPM/RPD.
- `decrAndClampToZero`: decrements a numeric key and clamps the value at 0 (used for queue counters).
- `returnTokensAtomic`: atomically returns RPM/RPD/user RPD tokens with TTL updates; safe to call when jobs are cancelled/expired/failed.
- `expireStaleJob`: removes old waiting/delayed jobs, decrements queue/user counters, marks job meta/result as `failed/expired`, and stamps `expired_at`.

---

# 🛰 5. HTTP API (Fastify)

This service has an HTTP API for integration with Next.js / other backends.

## POST `/resume/analyze`

Starts the analysis.

### Payload:

```ts
{
  userId: string;
  role: 'user' | 'admin';
  payload: object;
}
```

### Logic:

1.  Lua: user RPD (per mode) + concurrency lock
2.  Model selection + fallback (prior to enqueue)
3.  Backpressure per model (`queue:waiting:{model}` + dynamic cap)
4.  Job enqueue into lite/hard queue
5.  Return `{ jobId }`

---

## GET `/resume/:id/status`

Returns:

- `queued`
- `in_progress`
- `completed`
- `failed`

## GET `/resume/:id/result`

Returns:

```ts
{
  status,
  data?,
  error?,
  finished_at,
  used_model?
}
```

## POST `/admin/worker-concurrency`

Updates worker concurrency without deployment (requires internal API key):

```typescript
{ "queue": "lite" | "hard", "concurrency": 12 }
```

## POST `/admin/update-models-limits`

Update models limits from DB (requires internal API key):

## GET `/health`

Checks:

- Redis access
- Queue paused
- Worker alive
- Memory/CPU usage

---

# ⚙️ 6. Worker Logic (High Level)

- Consume model RPM/RPD (Lua `consumeExecutionLimits`).
- Resolve provider model name from Redis `model:{id}:limits.api_name` (DB is source of truth; worker waits for preload).
- Retryable errors (500/503/504, etc.) $\rightarrow$ BullMQ retry/delay (`attempts=2`).
- Non-retryable errors (400/403/404/429/500 context-too-long) $\rightarrow$ `UnrecoverableError` $\rightarrow$ failed, token refund, lock release.
- Queue events log completed/failed with jobId/state; even if BullMQ job is missing, meta/result are marked failed with TTL to avoid stuck jobs.

---

# ⏱ 7. Cron Tasks

## **DB Sync Cron (every 30s)**

1.  SCAN `job:*:result`
2.  Batch write to DB (meta-only older than ~35m are persisted as `failed/missing_result`)
3.  Mark synced and shorten TTL to ~5m (initial TTL is 24h on write)

## **Model Limit Refresh (every X min)**

Updates:

```
model:{name}:limits
```

## **Orphan Lock Cleanup (hourly)**

- SCAN `user:*:active_jobs`
- Removes `jobID`s that are not present in BullMQ

---

# 🩺 8. Health Check

```json
{
  "db": "ok",
  "redis": "ok",
  "queue": "ok",
  "workers": 3,
  "uptime": 551232,
  "cpu": "normal",
  "memory": "normal",
  "queueState": { "ready": "queueReady", "paused": "litePaused || hardPaused" },
  "db_pool": {
    "total": 10,
    "waiting": 3
  },
  "metrics": {
    "ram_rss_mb": 120,
    "cpu_load_1m": 2,
    "uptime_s": 53223123
  }
}
```

---

# 📴 9. Graceful Shutdown

```ts
async function shutdown() {
  await fastify.close();
  await queueLite.close();
  await queueHard.close();
  await stopCron();
  await redis.quit();
  await db.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```
