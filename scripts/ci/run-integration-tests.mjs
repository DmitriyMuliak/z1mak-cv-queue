#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Example of usage in CI/CD
 * 
 * 
 * 
 - name: Integration tests (Node script)
  env:
    HEALTH_RETRIES: '90'
    HEALTH_SLEEP_SECONDS: '1'
    CI_LOG_DIR: '/tmp'
  run: node scripts/ci/run-integration-tests.mjs
 * 
 * 
 * 
 */

const LOG_DIR = process.env.CI_LOG_DIR ?? '/tmp';
const HEALTH_RETRIES = Number(process.env.HEALTH_RETRIES ?? 60);
const HEALTH_SLEEP_SECONDS = Number(process.env.HEALTH_SLEEP_SECONDS ?? 1);
const PORT = process.env.PORT ?? '4000';
const HEALTH_URL = process.env.TEST_API_HEALTH_URL ?? `http://127.0.0.1:${PORT}/health`;
const MOCK_PORT = process.env.GEMINI_MOCK_PORT ?? '8080';
const MOCK_HEALTH_URL =
  process.env.TEST_MOCK_HEALTH_URL ?? `http://127.0.0.1:${MOCK_PORT}/health`;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'internal-secret';

const MOCK_LOG = path.join(LOG_DIR, 'mock-gemini.log');
const API_LOG = path.join(LOG_DIR, 'api.log');
const WORKER_LOG = path.join(LOG_DIR, 'worker.log');

/** @typedef {{name: string, child: import('node:child_process').ChildProcess, logPath: string, logStream: import('node:fs').WriteStream}} ManagedProc */

/** @type {ManagedProc[]} */
const managed = [];
let cleanedUp = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startProcess = async (name, args, logPath, env = process.env) => {
  await mkdir(path.dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: 'w' });
  const child = spawn(process.execPath, args, {
    env,
    stdio: ['ignore', logStream, logStream],
  });

  managed.push({ name, child, logPath, logStream });
};

const ensureHealth = async () => {
  for (let i = 1; i <= HEALTH_RETRIES; i += 1) {
    try {
      const res = await fetch(HEALTH_URL, {
        headers: { 'x-internal-api-key': INTERNAL_KEY },
      });
      if (res.ok) return;
    } catch {
      // Ignore and retry.
    }
    await sleep(HEALTH_SLEEP_SECONDS * 1000);
  }

  const res = await fetch(HEALTH_URL, {
    headers: { 'x-internal-api-key': INTERNAL_KEY },
  });
  if (!res.ok) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
};

const ensureMockHealth = async () => {
  for (let i = 1; i <= HEALTH_RETRIES; i += 1) {
    try {
      const res = await fetch(MOCK_HEALTH_URL);
      if (res.ok) return;
    } catch {
      // Ignore and retry.
    }
    await sleep(HEALTH_SLEEP_SECONDS * 1000);
  }

  const res = await fetch(MOCK_HEALTH_URL);
  if (!res.ok) {
    throw new Error(`Mock health check failed with status ${res.status}`);
  }
};

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed (${command} ${args.join(' ')}) code=${code ?? 'null'} signal=${signal ?? 'null'}`
        )
      );
    });
  });

const printLogs = async () => {
  console.error('Integration runtime logs:');
  for (const proc of managed) {
    console.log(`::group::Runtime logs for ${proc.name}`);
    try {
      const data = await readFile(proc.logPath, 'utf8');
      process.stdout.write(data);
    } catch (err) {
      console.error(`Failed to read log ${proc.logPath}:`, err);
    }
    console.log(`::endgroup::`);
  }
};

const shutdown = async (printRuntimeLogs) => {
  if (cleanedUp) return;
  cleanedUp = true;

  if (printRuntimeLogs) {
    await printLogs();
  }

  for (const proc of managed) {
    if (proc.child.exitCode === null && proc.child.signalCode === null) {
      proc.child.kill('SIGTERM');
    }
  }

  await sleep(1500);

  for (const proc of managed) {
    if (proc.child.exitCode === null && proc.child.signalCode === null) {
      proc.child.kill('SIGKILL');
    }
    proc.logStream.end();
  }
};

const onSignal = () => {
  shutdown(false)
    .catch(() => undefined)
    .finally(() => {
      process.exit(128);
    });
};

process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

const main = async () => {
  const runtimeEnv = {
    ...process.env,
    DB_SYNC_INTERVAL_MS: process.env.DB_SYNC_INTERVAL_MS ?? '1000',
    GEMINI_BASE_URL: process.env.GEMINI_BASE_URL ?? `http://127.0.0.1:${MOCK_PORT}`,
    GEMINI_MOCK_URL: process.env.GEMINI_MOCK_URL ?? `http://127.0.0.1:${MOCK_PORT}`,
    GEMINI_MOCK_CONFIG_URL:
      process.env.GEMINI_MOCK_CONFIG_URL ?? `http://127.0.0.1:${MOCK_PORT}/__config`,
  };

  const mockEnv = {
    ...runtimeEnv,
    PORT: MOCK_PORT,
  };

  await startProcess(
    'mock-gemini',
    ['dist/test/mock/MockGeminiProvider/geminiServer.js'],
    MOCK_LOG,
    mockEnv
  );
  await startProcess(
    'api',
    ['-r', './dist/test/mock/fastify/plugins/auth.js', 'dist/src/server/index.js'],
    API_LOG,
    runtimeEnv
  );
  await startProcess(
    'worker',
    [
      '-r',
      './dist/test/mock/MockGeminiProvider/registerGeminiMock.js',
      'dist/src/worker/index.js',
    ],
    WORKER_LOG,
    runtimeEnv
  );

  await ensureHealth();
  await ensureMockHealth();
  await runCommand('npm', ['run', 'test:integration']);
};

main()
  .catch(async (err) => {
    console.error(err);
    await shutdown(true);
    process.exit(1);
  })
  .then(async () => {
    await shutdown(false);
  });
