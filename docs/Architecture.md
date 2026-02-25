# 🧱 1. **System Overview**

This service is a separate Docker module, consisting of:

| Component                    | Purpose                                                                                                                                                                                              |
| :--------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fastify API Server**       | Accepts requests to launch an AI job, selects model + fallback chain, calls Lua for user RPD + concurrency, applies backpressure. Supports **SSE Streaming** via Redis Streams.                      |
| **BullMQ Queue (lite/hard)** | Separate queues for lite/hard modes                                                                                                                                                                  |
| **Worker Pool**              | Executes tasks, interacts with AI, applies model RPM/RPD limits, manages retry logic. For streaming jobs, adds chunks to Redis Streams.                                                              |
| **Redis**                    | Temporary storage for job metadata, RPD/RPM counters, waiting counters, concurrency locks. Used for **Streams** messaging during streaming.                                                          |
| **DB Sync Cron**             | SCAN + batch transfer of completed jobs from Redis $\rightarrow$ persistent DB; meta/result keys have 24h TTL, shortened to 5 minutes after sync; meta-only older than grace are persisted as failed |
| **Cleanup Cron**             | Removes orphan locks / stale waiting/delayed jobs, refunds limits (active jobs handled by BullMQ stalled checks)                                                                                     |

The service guarantees:

- **Real-time UX with Streaming (SSE over Fetch)**
- **Concurrency strictly within limits (per-user)**
- **Isolated high-performance API**
- **Atomic user RPD + concurrency in Redis (Lua)**
- **Model fallback at the API layer prior to enqueue**
- **Automatic retries via BullMQ for retryable errors**
- **Deterministic persistence of results to the DB**
- **Resilience to failures, restarts, and peak load scenarios**

---

# 🧩 2. **High-Level Architecture Diagram**

```mermaid
flowchart TD
    A[Client App NextJS] --> B[Jobs API - Fastify]
    B --> C{{Redis Lua Checks\nConcurrency / User RPD}}
    C -->|OK| R1[Redis Storage\nHashes + ZSETs]
    C -->|Limit Exceeded| F1[Try Fallback Model]
    F1 -->|Fallback Exists| C
    F1 -->|No Fallback| Z1[Return 429]
    R1 --> Q[BullMQ Queue]
    Q --> W1[Worker 1]
    Q --> W2[Worker 2]
    Q --> W3[Worker N]
    W1 --> P[Worker Pipeline]
    W2 --> P
    W3 --> P
    P --> STREAM[Redis Streams\nStreaming Chunks]
    STREAM --> B
    B -->|SSE Response| A
    P --> R2[Redis Job Result]
    R2 --> CRON[DB Sync Cron\nEvery 5 Minutes]
    CRON --> DB[(Persistent DB)]
```

---

# ⚙️ 3. **Core Functional Goals**

| Feature                           | Guarantee                                                                                             |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------- |
| **Real-time Streaming**           | Low latency partial results via SSE (Server-Sent Events) over HTTP.                                   |
| **Global Model Limits (RPM/RPD)** | Models are not overloaded (consumed in worker; RPM $\rightarrow$ delayed, RPD $\rightarrow$ fail)     |
| **User Daily RPD (Fixed Window)** | API acquires token via Lua (pre-enqueue)                                                              |
| **User Concurrency (ZSET TTL)**   | API maintains active jobs with $\text{TTL} \sim 31 \text{ min}$, cleans up zombies in Lua and worker  |
| **Queue Backpressure**            | Each model has `queue:waiting:{model}` + dynamic `maxQueueLength` ($\sim 30 \text{ min}$ SLA)         |
| **Fallback**                      | Models automatically shift down in priority **at the API layer** before queuing                       |
| **Retry**                         | AI retryable $\rightarrow$ BullMQ delay; non-retryable/limit $\rightarrow$ immediate fail             |
| **Token Return**                  | Model tokens are refunded upon final failure/processing of QueueEvents                                |
| **DB Persistence**                | No job is lost; meta-only jobs older than grace are persisted as failed                               |
| **Zero Downtime Reconfiguration** | Model limits hot-reload                                                                               |
| **Dynamic Worker Concurrency**    | Worker concurrency is read from Redis, updated via Pub/Sub + admin endpoint                           |
| **Stalled Recovery**              | BullMQ stalled detection configured (60s lock/stalled interval, max stalled count 1) for dead workers |
| **Scalability**                   | Up to $\text{20–50k RPS}$ without major changes                                                       |
| **Fault Tolerance**               | Worker crash $\rightarrow$ job requeued, lock auto-expire                                             |

---

# 🔥 4. **API-Level Fallback FSM (Pre-Enqueue)**

API-level fallback works prior to enqueue and controls:

- User RPD (per mode) + concurrency
- Model backpressure
- Model availability (existence of limits)

<!-- end list -->

```mermaid
stateDiagram-v2

    [*] --> PrimaryModel
    PrimaryModel --> LuaChecks
    LuaChecks --> Enqueue : all OK
    LuaChecks --> Fallback : model limit exceeded
    Fallback --> NextModel : next fallback exists
    NextModel --> LuaChecks
    Fallback --> Reject : no fallback available
    Reject --> [*]
    Enqueue --> [*]
```

---

# 👷‍♂️ 5. **Worker-Level FSM (Post-Enqueue)**

**Fallback** logic is absent. **Retry** logic is fully delegated to BullMQ. Model limits are applied here.

```mermaid
flowchart TD

    A[Worker Start] --> B(Call AI Service)

    B -->|Streaming Enabled| STREAM[Add chunks to Redis Stream]
    STREAM --> B
    B -->|Success| C[Write Completed Result]
    C --> D[Remove Lock]
    D --> E_end[Job Done]

    B -->|Error Retryable| F(Throw Exception)
    F --> G[BullMQ Delay]
    G -->|Retries Left| A
    G -->|No Retries| H[QueueEvents Failed]

    H --> I[Return Tokens]
    I --> J[Write Final Status]
    J --> K[Remove Lock Safety]
    K --> E_end

    B -->|Error Non-Retryable| F
```

---

# 🕒 6. **Timestamp Policy**

- All timestamps are UTC. Used in Locks, Job Results, Per-User RPD.
- **Gemini RPD Limits**: Note that Gemini API limits typically reset at **12:00 AM Pacific Time (PT)**. Our system uses UTC for internal tracking, but daily resets for Gemini-based models should account for this offset if strictly aligning with provider windows.

---

# 🗄️ 7. **Redis Schema (Detailed)**

## 7.1 Redis Data Types Usage

| Type       | Usage in Project                         | Why?                                                             |
| :--------- | :--------------------------------------- | :--------------------------------------------------------------- |
| **SET**    | `models:ids`                             | Unordered collection of unique model IDs.                        |
| **ZSET**   | `user:{id}:active_jobs`                  | Sorted collection of Job IDs where **score = expiry timestamp**. |
| **HASH**   | `job:{id}:meta`, `model:{id}:limits`     | Stores multiple fields for a single object.                      |
| **STRING** | `user:{id}:rpd:...`, `queue:waiting:...` | Simple counters or single values.                                |
| **STREAM** | `job:stream:{id}`                        | Buffer for real-time AI chunks with history.                     |

## 7.2 Model Limits (HASH)

`model:{name}:limits`: `rpm`, `rpd`, `api_name`, `updated_at`.

## 7.3 Model Catalog (SET)

`models:ids` = list of model ids loaded from DB.

## 7.4 Per-user RPD (STRING with TTL)

`user:{id}:rpd:{lite|hard}:{YYYY-MM-DD}` = counter (string).

## 7.5 Queue Waiting per Model (STRING)

`queue:waiting:{model}` = current enqueued/waiting count.

## 7.6 Concurrency Locks (ZSET)

`user:{id}:active_jobs`: member: jobId, score: expiry_timestamp (ms).

## 7.7 Job Metadata (HASH)

`job:{id}:meta`: `user_id`, `model`, `created_at`, `status`, `streaming`, etc.

---

# 🧠 8. **Lua Scripts (Atomic Enforcement, Summary)**

- `combinedCheckAndAcquire` (API): Cleans up expired zombie locks in ZSET, checks user concurrency, validates/increments user RPD, and performs a model RPD pre-check. Returns status codes: `OK`, `CONCURRENCY_LIMIT_EXCEEDED`, `USER_RPD_EXCEEDED`, `MODEL_RPD_EXCEEDED`.
- `consumeExecutionLimits` (Worker): Atomically validates and increments model RPM and RPD counters.
- `returnTokensAtomic` (Worker/Cleanup): Atomically refunds (decrements) model RPM, model RPD, and (optionally) user RPD counters while ensuring they never drop below zero.
- `expireStaleJob` (Cleanup Cron): Performs atomic cleanup of a job: decrements model waiting count, removes user concurrency lock, decrements user RPD, and marks job meta/result as `failed` with `expired` error code.
- `decrAndClampToZero` (Utility): Safely decrements a numeric key while ensuring it never goes below zero.

---

# 🏗️ 9. **Worker Execution Pipeline** (Current)

1.  Marks job as "in_progress" (`job:meta`).
2.  Resolves provider model name from `model:{id}:limits.api_name`.
3.  Calls **`ModelProviderService.execute`** (or `executeStream` if `streaming: true`).
4.  If **streaming** $\rightarrow$ adds chunks to Redis Stream `job:stream:{jobId}` and aggregates full text.
5.  If **success** $\rightarrow$ records result (`job:result`) and **removes concurrency lock**.
6.  If **retryable** $\rightarrow$ throws exception, **BullMQ** performs backoff retry.
7.  If **non-retryable** $\rightarrow$ `UnrecoverableError` $\rightarrow$ BullMQ sets `failed`.
8.  **`queueEvents.on('failed')`** $\rightarrow$ **refunds tokens** and records final `failed` status.

---

# 📦 10. **DB Sync Architecture**

Cron ($\text{5 minutes}$):

1. `SCAN job:*:result` in batches.
2. merge($\text{meta} + \text{result}$).
3. batch insert $\rightarrow$ DB ($\text{upsert}$).
4. delete Redis keys (shorten TTL).

Guarantees:

- DB never overloaded ($\text{batch writes}$)
- Redis remains light
- no duplicates ($\text{idempotent writes}$)

---

# 🧨 11. **Failure Modes**

| Failure              | Behaviour                                                                                  |
| :------------------- | :----------------------------------------------------------------------------------------- |
| Redis down           | System becomes permissive auto-recovery                                                    |
| Worker crash         | Job requeued, lock auto-expires                                                            |
| API crash            | Stateless, locks unaffected                                                                |
| DB temporary down    | Redis retains data until next sync                                                         |
| Cron failure         | Next run resumes processing                                                                |
| **Final Job Failed** | **Model tokens are refunded; status=failed is recorded**                                   |
| Stale jobs           | Cron `expireStaleJobs` removes waiting/locks/RPD, sets $\text{error\_code}=\text{expired}$ |

---

# 📈 12. **Scalability Roadmap**

| Stage     | Architecture                                       |
| :-------- | :------------------------------------------------- |
| 1–5k RPS  | Single Redis, 2 queues (lite/hard)                 |
| 5–20k RPS | Single Redis, 2 BullMQ Queues, N Workers           |
| 20k+ RPS  | Single Redis (bigger) or Dragonfly, queue sharding |

---

# 🩺 13. **Health Checks**

`GET /health` reports:

- Redis connectivity
- DB connectivity (SELECT 1)
- BullMQ queue readiness + paused state
- DB pool metrics (total/waiting)
- Memory & CPU
- Uptime

## 13.1 **Operational Limits & Ratios**

**Worker concurrency defaults**

- `DEFAULT_CONCURRENCY`: `lite=8`, `hard=3` (total 11). Overrides can be applied via Redis config.

**DB pool limits**

- `max=10` (kept below Supabase hard limit 15)
- `idleTimeoutMillis=30000`
- `allowExitOnIdle=true`
- `connectionTimeoutMillis=5000`

**Health check timing chain**

- `connectionTimeoutMillis (5s) < /health REQUEST_TIMEOUT (7s) < Fly http_checks timeout (8s)`
- Fly http_checks `interval=20s` should stay higher than the timeout; `grace_period=20s` allows cold start warm-up

---

# 💀 14. **Graceful Shutdown**

API & Worker:

1.  Stop accepting new jobs
2.  Finish active work
3.  Close queue
4.  Close Redis
5.  Exit cleanly

---

# 📄 15. **Documentation**

| File                | Purpose                     |
| :------------------ | :-------------------------- |
| **README.md**       | User-facing overview, usage |
| **Architecture.md** | Deep internal specification |
| **RateLimits.md**   | Detailed limit logic        |
| **Worker.md**       | Flow diagram                |
