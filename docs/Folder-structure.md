# Folder structure

- ls -laR | cat > ls.txt
- npx -y tree-node-cli -I "node_modules|dist|.git" > ls.txt
- npx -y tree-node-cli -L 2 -I "node_modules|dist|.git|package-lock.json" > ls.txt

```text
z1mak-cv-queue
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
