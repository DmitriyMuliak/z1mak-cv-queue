# CI/CD Workflows

This document explains what each GitHub Actions workflow does and why.

## Files

- `.github/workflows/pr.yml` - checks on every pull request.
- `.github/workflows/deploy.yml` - full validation + deploy on push to `master`.
- `scripts/ci/run-integration-tests.sh` - shared integration runtime script for both workflows.

## `pr.yml` (PR checks)

Purpose: fail fast on code quality and integration regressions before merge.

Flow:

1. Checkout + Node setup

- `actions/checkout`
- `actions/setup-node` with npm cache

2. Static checks + build

- `npm ci`
- `npm run lint`
- `npm run build`

3. Unit tests

- `npm run test:unit`

4. Integration DB preparation

- `npm run test:db:migrate`
- Applies SQL from `test/database/migrations` to CI Postgres service.

5. Integration tests

- `bash scripts/ci/run-integration-tests.sh`
- Starts mock-gemini, API, worker as background Node processes.
- Waits for API health.
- Runs `npm run test:integration`.
- Prints runtime logs on failure.

## `deploy.yml` (Deploy to Fly)

Purpose: run the same quality gate as PR, then deploy.

Flow:

1. Same validation pipeline as PR

- install, lint, build, unit tests, DB migrations, integration tests

2. Deploy

- setup Flyctl
- `flyctl deploy --remote-only --wait-timeout 300`

Deploy is blocked if any validation stage fails.

## Why Postgres/Redis are GitHub `services`

- Lower overhead than per-test Docker Compose stacks.
- Stable endpoints in CI.
- Simple lifecycle managed by the job.

## Shared workflow env

Core values used in both workflows:

- `TEST_USE_COMPOSE=0` - disable Docker Compose from test code in CI.
- `DATABASE_URL` - Postgres service connection.
- `REDIS_URL` - Redis service connection.
- `INTERNAL_API_KEY` - internal auth for health and test calls.
- `GEMINI_MOCK_URL` and `GEMINI_BASE_URL` - mock provider endpoints.
- `PORT` - API port.

Test helpers can still accept optional `TEST_*` overrides, but CI now keeps one primary source of truth via app env variables above.

## `scripts/ci/run-integration-tests.sh`

What it does:

1. Starts `mock-gemini`, `api`, `worker` from `dist/`.
2. Waits until `/health` responds with internal key.
3. Runs integration tests.
4. Always cleans up background processes (`trap`), and prints logs on failure.

Why it exists:

- Keeps workflow YAML short.
- Removes duplicated shell logic from `pr.yml` and `deploy.yml`.
- Centralizes integration runtime behavior in one place.
