import { defineConfig, devices } from '@playwright/test';

/**
 * The exported-bundle suite. Opt-in (`pnpm test:player-e2e`) because the global
 * setup produces a real release and a real static export, and the Expo web build
 * behind it takes minutes.
 */
const bundleOrigin = 'http://127.0.0.1:8095';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e/player',
  testMatch: /(bundle|desktop)[.]spec[.]ts/,
  timeout: isCI ? 180_000 : 90_000,
  globalSetup: './e2e/player/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: isCI ? 30_000 : 10_000 },
  use: {
    baseURL: bundleOrigin,
    ...devices['Desktop Chrome'],
    actionTimeout: isCI ? 30_000 : 0,
    navigationTimeout: isCI ? 90_000 : 0,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/tsx/dist/cli.mjs e2e/player/serve-bundle.ts e2e/player/.bundle 8095',
    // Readiness is the server, not the bundle: Playwright starts this before
    // the global setup that produces the files it will serve.
    url: `${bundleOrigin}/__health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
  },
});
