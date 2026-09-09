import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * The config lives in `config/`, and Playwright anchors `webServer.cwd` on the
 * config file's own directory. Every server here is a repo-root command.
 */
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * The exported-bundle suite. Opt-in (`pnpm test:player-e2e`) because the global
 * setup produces a real release and a real static export, and the Expo web build
 * behind it takes minutes.
 */
const bundleOrigin = 'http://127.0.0.1:8095';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  outputDir: path.resolve(REPO_ROOT, 'test-results'),
  testDir: '../tests/e2e/player',
  testMatch: /(bundle|desktop)[.]spec[.]ts/,
  timeout: isCI ? 180_000 : 90_000,
  globalSetup: '../tests/e2e/player/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never', outputFolder: path.resolve(REPO_ROOT, 'playwright-report') }]] : 'list',
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
    command: 'node node_modules/tsx/dist/cli.mjs tests/e2e/player/serve-bundle.ts tests/e2e/player/.bundle 8095',
    cwd: REPO_ROOT,
    // Readiness is the server, not the bundle: Playwright starts this before
    // the global setup that produces the files it will serve.
    url: `${bundleOrigin}/__health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
  },
});
