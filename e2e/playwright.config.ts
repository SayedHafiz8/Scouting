import { defineConfig, devices } from '@playwright/test';

// Reads E2E_* credentials from e2e/.env (git-ignored)
// Reads CLIENT_URL from the same file (defaults to http://localhost:4200)
// See .env.example for required variables.

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // Spec files share one coach account (and proScout/admin accounts) rather
  // than provisioning per-worker fixtures. `fullyParallel: false` only
  // serializes tests within a single file — different spec files still run
  // concurrently on separate workers by default, and concurrent logins as
  // the same account race the backend's refresh-token rotation, silently
  // invalidating another worker's session mid-test. Force a single worker
  // so the whole suite runs serially until per-account test isolation exists.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,

  use: {
    baseURL: process.env.CLIENT_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Each test manages its own auth (players/reports call loginAsCoach in
    // beforeEach; auth tests override storageState to empty and test the
    // login flow directly). No shared setup project needed.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
