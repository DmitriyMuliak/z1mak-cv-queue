import { startCompose, stopCompose, usingCompose, waitForApi } from './utils/rateTestUtils';

export async function setup() {
  if (usingCompose) {
    console.log('[Global Setup] Starting Docker Compose...');
    await startCompose();
  }
  // In native CI mode (TEST_USE_COMPOSE=0), API/worker are started by workflow steps.
  await waitForApi();
}

export async function teardown() {
  if (usingCompose) {
    console.log('[Global Setup] Stopping Docker Compose...');
    await stopCompose();
  }
}
