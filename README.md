# 🚀 **AI Resume analyzer Service — Queue + Worker + API Backend**

## This service is the core of the AI analysis execution system.

It processes jobs considering:

- **Real-time Streaming** (NDJSON) — low latency UX
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
10. Folder structure

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
    Worker --> STREAM[Redis Pub/Sub\nStreaming]
    STREAM --> API
    Worker --> Result[Redis Job Result]

    Result --> Sync[DB Sync Cron + cleanup]
    Sync --> DB[(Database)]
```

---

# 🔄 2. Data Flow

### **1) HTTP API: Standard vs Streaming**

- **Payload validation**: Model selection + fallback logic (prior to enqueue).
- **Lua `combinedCheckAndAcquire`**: 
  - Validates user RPD (Rate Per Day) based on mode (lite/hard).
  - Acquires a concurrency lock in a ZSET.
  - Performs a soft model RPD pre-check.
- **Backpressure**: Checks if `queue:waiting:{model}` exceeds dynamic `maxQueueLength` (\~30 min SLA).
- **Enqueueing**:
  - **Standard (`/analyze`)**: Enqueues job and returns `{ jobId }` immediately. Client polls `/result`.
  - **Streaming (`/analyze-stream`)**: 
    - API subscribes to Redis Pub/Sub channel `job:stream:{jobId}`.
    - API opens an HTTP connection with `Transfer-Encoding: chunked`.
    - API enqueues job with `streaming: true`.

### **2) Worker Execution**

- **Limit Consumption**: Lua `consumeExecutionLimits` checks and consumes model RPM/RPD.
- **Execution**:
  - **Standard**: Calls `modelProvider.execute()`, waits for full result.
  - **Streaming**: Calls `modelProvider.executeStream()`. Each chunk received from AI is:
    1. Published to Redis Pub/Sub channel `job:stream:{jobId}`.
    2. Appended to a local buffer in the worker to form the full result.
- **Completion**: 
  - On success: Worker publishes `{"type":"done"}`, writes full result to Redis `job:{id}:result`, and updates metadata.
  - On failure: Worker publishes `{"type":"error"}`, triggers token refund (if AI wasn't reached), and marks status as `failed`.

### **3) DB Synchronization (Cron every 30s)**

- **SCAN `job:*:result`**: Collects all completed jobs.
- **Persistence**: Batch upsert results into the persistent Database.
- **TTL Management**: After sync, the TTL of Redis keys is reduced from 24h to 5 minutes.
- **Resilience**: Meta-only jobs older than ~35m (orphans) are persisted as `failed/missing_result` to ensure the UI doesn't hang forever.

### **4) Dynamic Worker Concurrency**

- Values are read from Redis `config:worker:{lite|hard}:concurrency`.
- Workers use Pub/Sub `config:update` to hot-reload concurrency without restarts.
- BullMQ stalled detection ensures jobs are recycled if a worker process dies unexpectedly.

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
  streaming (true|false)
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
Starts the analysis (standard polling mode). Returns `{ jobId }`.

## POST `/resume/analyze-stream`
Starts the analysis in **streaming mode** (NDJSON).
- API subscribes to Redis Pub/Sub `job:stream:{jobId}`.
- Streams chunks using `Transfer-Encoding: chunked`.

## GET `/resume/:id/status`
Returns: `queued`, `in_progress`, `completed`, `failed`.

## GET `/resume/:id/result`
Returns: `{ status, data?, error?, finished_at, used_model? }`.

## POST `/admin/worker-concurrency`
Updates worker concurrency without deployment (requires internal API key):
`{ "queue": "lite" | "hard", "concurrency": 12 }`

---

# ⚙️ 6. Worker Logic (High Level)

- Consume model RPM/RPD (Lua `consumeExecutionLimits`).
- Resolve provider model name from Redis `model:{id}:limits.api_name`.
- **Streaming Detection**: If `job.data.streaming === true`, use `executeStream()` and PUBLISH chunks to Redis.
- Retryable errors (500/503/504, etc.) $\rightarrow$ BullMQ retry/delay (`attempts=2`).
- Non-retryable errors $\rightarrow$ `UnrecoverableError` $\rightarrow$ failed, token refund, lock release.

---

# ⏱ 7. Cron Tasks

## **DB Sync Cron (every 30s)**
1. SCAN `job:*:result`.
2. Batch write to DB.
3. Mark synced and shorten TTL to ~5m.

## **Model Limit Refresh (every X min)**
Updates `model:{name}:limits` from DB.

## **Orphan Lock Cleanup (hourly)**
- SCAN `user:*:active_jobs`.
- Removes `jobID`s that are not present in BullMQ.

---

# 🩺 8. Health Check
`GET /health` reports:
- Redis/DB connectivity.
- Queue readiness + worker counts.
- Memory/CPU/Uptime metrics.

---

# 📴 9. Graceful Shutdown
1. Stop accepting new jobs.
2. Finish active work.
3. Close BullMQ Queues and Redis connections.
4. Exit process.

---

# 📁 10. Folder structure

```text
root
├── src
│   ├── ai              // provider implementations and selection logic
│   ├── config          // env parsing and configuration helpers
│   ├── constants       // shared constants (TTL, limits, etc.)
│   ├── cron            // scheduled tasks (sync DB, cleanup, expire stale jobs)
│   ├── db              // database client and queries
│   ├── plugins         // Fastify plugins (redis, db, shutdown, etc.)
│   ├── redis           // redis client, keys, Lua scripts
│   ├── routes          // HTTP routes (resume, admin, health)
│   ├── server.ts       // Fastify bootstrap
│   ├── services        // domain services (user limits preload, etc.)
│   ├── types           // shared TypeScript types
│   ├── utils           // helper utilities
│   └── worker          // BullMQ worker entrypoint and pipeline
├── docs
│   ├── Architecture.md
│   ├── RateLimits.md
│   ├── FrontendStreamingIntegration.md
│   ├── TESTS.md
│   └── Worker.md
...
```
