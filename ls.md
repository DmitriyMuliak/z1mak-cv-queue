ls -laR | cat > ls.txt
npx -y tree-node-cli -I "node_modules|dist|.git" > ls.txt
npx -y tree-node-cli -L 2 -I "node_modules|dist|.git|package-lock.json" > ls.txt

```text
z1mak-cv-queue
├── AGENT.md
├── Dockerfile
├── README.md
├── db
│   └── migrations
│       ├── 000_enable_extensions.sql
│       ├── 001_create_ai_models.sql
│       ├── 002_create_resume.sql
│       ├── 003_create_job.sql
│       ├── 004_create_user_limits.sql
│       ├── 005_create_user_daily_usage.sql
│       ├── 006_seed_ai_models.sql
│       └── 007_function_user_created.sql
├── docker-compose.develop.yml
├── docker-compose.test.yml
├── docker-compose.yml
├── docs
│   ├── Architecture.md
│   ├── RateLimits.md
│   ├── TESTS.md
│   ├── Woker.md
│   └── uk
│       ├── Architecture.md
│       ├── DBScale.md
│       ├── README.md
│       ├── RateLimits.md
│       └── TESTS.md
├── eslint.config.cjs
├── fly.toml
├── ls
├── ls.txt
├── package-lock.json
├── package.json
├── src
│   ├── ai
│   │   ├── ModelProviderService.ts
│   │   ├── providers
│   │   │   └── gemini
│   │   │       ├── GeminiProvider.ts
│   │   │       ├── builders
│   │   │       │   ├── buildPromptSettings.ts
│   │   │       │   ├── getImmediateInstruction.ts
│   │   │       │   ├── getSystemInstructions.ts
│   │   │       │   ├── getTaskContext.ts
│   │   │       │   └── safetySettings.ts
│   │   │       ├── errorMapping.ts
│   │   │       └── utils.ts
│   │   ├── schema
│   │   │   ├── SchemaService.ts
│   │   │   └── propertyDefinitions.ts
│   │   └── utils
│   │       └── errorUtils.ts
│   ├── config
│   │   └── env.ts
│   ├── cron
│   │   ├── cleanupOrphanLocks.ts
│   │   ├── expireStaleJobs.ts
│   │   ├── index.ts
│   │   ├── reloadModelLimits.ts
│   │   ├── syncDbResults.ts
│   │   └── utils
│   │       ├── runWithLock.ts
│   │       ├── safeJsonParse.ts
│   │       └── scanKeys.ts
│   ├── db
│   │   └── client.ts
│   ├── plugins
│   │   ├── corsDeny.ts
│   │   ├── database.ts
│   │   ├── internalAuth.ts
│   │   └── redis.ts
│   ├── redis
│   │   ├── channels.ts
│   │   ├── client.ts
│   │   ├── keys.ts
│   │   ├── keys.types.ts
│   │   ├── luaScripts
│   │   │   ├── combinedCheckAndAcquire.lua
│   │   │   ├── consumeExecutionLimits.lua
│   │   │   ├── decrAndClampToZero.lua
│   │   │   ├── expireStaleJob.lua
│   │   │   └── returnTokensAtomic.lua
│   │   └── scripts.ts
│   ├── routes
│   │   ├── admin
│   │   │   ├── admin.ts
│   │   │   └── schema.ts
│   │   ├── health.ts
│   │   └── resume
│   │       ├── enqueueJob.ts
│   │       ├── modelSelection.ts
│   │       ├── queueUtils.ts
│   │       ├── resume.ts
│   │       └── schema.ts
│   ├── server.ts
│   ├── services
│   │   ├── limitsCache.ts
│   │   ├── modelSelector.ts
│   │   ├── userLimitsPreloader.ts
│   │   └── userLimitsService.ts
│   ├── types
│   │   ├── globals
│   │   │   └── fastify.d.ts
│   │   ├── mode.ts
│   │   └── queueCodes.ts
│   ├── utils
│   │   ├── mode.ts
│   │   ├── parseJson.ts
│   │   └── time.ts
│   └── worker
│       ├── concurrencyManager.ts
│       ├── configSubscription.ts
│       ├── consumeLimitsIfNeeded.ts
│       ├── consumeModelLimits.ts
│       ├── createWorker.ts
│       ├── executeModel.ts
│       ├── finalizeFailure.ts
│       ├── finalizeSuccess.ts
│       ├── handleJob.ts
│       ├── index.ts
│       ├── markInProgress.ts
│       ├── queueEvents.ts
│       ├── returnTokens.ts
│       └── types.ts
├── supabase
│   └── config.toml
├── temp
│   ├── TODO.md
│   └── models.ts
├── test
│   ├── integration
│   │   └── rateLimiter.integration.test.ts
│   ├── mock
│   │   ├── MockGeminiProvider
│   │   │   ├── HttpMockGeminiProvider.ts
│   │   │   ├── geminiServer.ts
│   │   │   └── registerGeminiMock.ts
│   │   ├── Queue.ts
│   │   ├── Redis.ts
│   │   ├── SupabaseClient.ts
│   │   └── testDoubles.ts
│   ├── unit
│   │   ├── cron.test.ts
│   │   ├── gemini
│   │   │   └── errorMapping.test.ts
│   │   ├── resume
│   │   │   └── modelSelection.test.ts
│   │   └── worker
│   │       └── worker.test.ts
│   └── utils
│       └── rateTestUtils.ts
├── tsconfig.build.json
├── tsconfig.json
└── vitest.config.ts
```
