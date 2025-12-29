# Tests

This project has unit tests and integration tests. Unit tests run fast with mocks.
Integration tests spin up Docker services (API, worker, Redis, Postgres, mock Gemini)
and hit the real HTTP endpoints.

## Unit tests

- Run: `npm run test:unit`
- Framework: Vitest
- Mocks live under `test/mock`
- `vitest.config.ts` excludes `dist/**` to avoid running compiled tests

## Integration tests

- Run: `npm run test:integration`
- Uses Docker Compose (`docker-compose.test.yml`)
- Services: `db` (Postgres), `redis`, `api`, `worker`, `mock-gemini`
- The API readiness check hits `GET /health` until it returns 2xx

Relevant env overrides (see `test/utils/rateTestUtils.ts`):

- `TEST_USE_COMPOSE=0` to skip Docker Compose
- `COMPOSE_FILE` to override compose file
- `TEST_API_URL` / `TEST_REDIS_URL` / `GEMINI_MOCK_CONFIG_URL`
- `TEST_INTERNAL_KEY` for internal auth

## Why build includes MockGeminiProvider

Integration containers run these files from `dist`:

- `dist/test/mock/MockGeminiProvider/registerGeminiMock.js`
- `dist/test/mock/MockGeminiProvider/geminiServer.js`

Because of that, `tsconfig.build.json` includes
`test/mock/MockGeminiProvider/**/*` so these files are compiled into `dist`.
All other tests stay excluded from the build output.

## Notes

- Integration tests may take longer on first run due to image pulls/builds.
- Production uses external Supabase/Postgres; the `db` service exists only
  for integration tests.

## Create Admin

```
set -a; source .env.development; set +a
npx ts-node scripts/makeAdminExisting.ts --email "you@example.com"
npx ts-node scripts/createAdminUser.ts --email "you@example.com" --password "pass123"
```
