# Tests

This project has unit tests and integration tests. Unit tests run fast with mocks.
Integration tests hit real HTTP endpoints and run against Redis + Postgres + worker pipeline.

## Unit tests

- Run: `npm run test:unit`
- Framework: Vitest
- Mocks live under `test/mock`
- `vitest.config.ts` excludes `dist/**` to avoid running compiled tests

## Integration tests

- Run: `npm run test:integration`
- Uses dedicated config: `vitest.integration.config.ts`
- Runs in a single worker (`fileParallelism=false`, `maxWorkers=1`) for stable shared state
- Global setup (`test/globalSetup.ts`) starts infra once per whole integration run

Relevant env overrides (see `test/utils/rateTestUtils.ts`):

- `TEST_USE_COMPOSE=0` to skip Docker Compose (CI mode)
- `COMPOSE_FILE` to override compose file
- Optional test-level overrides: `TEST_API_URL` / `TEST_REDIS_URL` / `TEST_INTERNAL_KEY` / `GEMINI_MOCK_CONFIG_URL`
- Main app env values are also supported as defaults (`PORT`, `REDIS_URL`, `INTERNAL_API_KEY`, `GEMINI_MOCK_URL`)
- `TEST_DB_PORT` for local compose port mapping (default `54321`)
- `TEST_DATABASE_URL` optional override for test DB connection string
- `TEST_USE_POOL_OFFSET=1` enables `VITEST_POOL_ID`-based port/project offset

Parallel mode notes:

- Default mode is shared runtime (global setup + single worker), so `VITEST_POOL_ID` offset is intentionally disabled.
- Use `TEST_USE_POOL_OFFSET=1` only if each Vitest worker/process has isolated infra (separate compose project / ports).
- In current setup, enabling file parallelism without infra isolation will cause conflicts.

CI helper:

- `npm run test:db:migrate` applies SQL files from `test/database/migrations` to current DB

## Why build includes MockGeminiProvider

Integration runtime (compose or native CI) runs these files from `dist`:

- `dist/test/mock/MockGeminiProvider/registerGeminiMock.js`
- `dist/test/mock/MockGeminiProvider/geminiServer.js`

Because of that, `tsconfig.build.json` includes
`test/mock/MockGeminiProvider/**/*` so these files are compiled into `dist`.
All other tests stay excluded from the build output.

## Notes

- Local integration may take longer on first run due to Docker image pulls/builds.
- CI integration uses GitHub Action service containers (`postgres`, `redis`) and starts `api/worker/mock-gemini` as Node processes.
- Production uses external Supabase/Postgres; the `db` service exists only
  for integration tests.

## Create Admin

```
set -a; source .env.development; set +a
npx ts-node scripts/makeAdminExisting.ts --email "you@example.com"
npx ts-node scripts/createAdminUser.ts --email "you@example.com" --password "pass123"
```

```
npm run admin:make -- --email "you@example.com"
npm run admin:create -- --email "you@example.com" --password "pass123"
```
