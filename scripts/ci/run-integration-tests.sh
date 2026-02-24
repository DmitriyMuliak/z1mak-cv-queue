#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${CI_LOG_DIR:-/tmp}"
HEALTH_RETRIES="${HEALTH_RETRIES:-60}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-1}"
PORT_VALUE="${PORT:-4000}"
HEALTH_URL="${TEST_API_HEALTH_URL:-http://127.0.0.1:${PORT_VALUE}/health}"
MOCK_PORT_VALUE="${GEMINI_MOCK_PORT:-8080}"
MOCK_HEALTH_URL="${TEST_MOCK_HEALTH_URL:-http://127.0.0.1:${MOCK_PORT_VALUE}/health}"
INTERNAL_KEY="${INTERNAL_API_KEY:-internal-secret}"

export GEMINI_BASE_URL="${GEMINI_BASE_URL:-http://127.0.0.1:${MOCK_PORT_VALUE}}"
export GEMINI_MOCK_URL="${GEMINI_MOCK_URL:-http://127.0.0.1:${MOCK_PORT_VALUE}}"
export GEMINI_MOCK_CONFIG_URL="${GEMINI_MOCK_CONFIG_URL:-${GEMINI_MOCK_URL}/__config}"

MOCK_LOG="${LOG_DIR}/mock-gemini.log"
API_LOG="${LOG_DIR}/api.log"
WORKER_LOG="${LOG_DIR}/worker.log"

MOCK_PID=""
API_PID=""
WORKER_PID=""

cleanup() {
  local exit_code=$?
  if [ "${exit_code}" -ne 0 ]; then
    echo "Integration runtime logs:"
    echo "--- mock-gemini ---"
    cat "${MOCK_LOG}" || true
    echo "--- api ---"
    cat "${API_LOG}" || true
    echo "--- worker ---"
    cat "${WORKER_LOG}" || true
  fi

  if [ -n "${WORKER_PID}" ]; then kill "${WORKER_PID}" >/dev/null 2>&1 || true; fi
  if [ -n "${API_PID}" ]; then kill "${API_PID}" >/dev/null 2>&1 || true; fi
  if [ -n "${MOCK_PID}" ]; then kill "${MOCK_PID}" >/dev/null 2>&1 || true; fi
}

trap cleanup EXIT

PORT="${MOCK_PORT_VALUE}" node dist/test/mock/MockGeminiProvider/geminiServer.js > "${MOCK_LOG}" 2>&1 &
MOCK_PID=$!

node -r ./dist/test/mock/fastify/plugins/auth.js dist/src/server/index.js > "${API_LOG}" 2>&1 &
API_PID=$!

node -r ./dist/test/mock/MockGeminiProvider/registerGeminiMock.js dist/src/worker/index.js > "${WORKER_LOG}" 2>&1 &
WORKER_PID=$!

for ((i=1; i<=HEALTH_RETRIES; i++)); do
  if curl -fsS -H "x-internal-api-key: ${INTERNAL_KEY}" "${HEALTH_URL}" >/dev/null; then
    break
  fi
  sleep "${HEALTH_SLEEP_SECONDS}"
done

curl -fsS -H "x-internal-api-key: ${INTERNAL_KEY}" "${HEALTH_URL}" >/dev/null

for ((i=1; i<=HEALTH_RETRIES; i++)); do
  if curl -fsS "${MOCK_HEALTH_URL}" >/dev/null; then
    break
  fi
  sleep "${HEALTH_SLEEP_SECONDS}"
done

curl -fsS "${MOCK_HEALTH_URL}" >/dev/null
npm run test:integration
