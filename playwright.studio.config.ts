import { defineConfig, devices } from '@playwright/test';

/**
 * The studio flows an author actually performs, driven through the real UI.
 *
 * Separate from the AI suite because it needs no bridge, and separate from the
 * player suite because it drives the editor rather than a published bundle. It
 * exists for one thing the project never had: proof that publishing a release
 * works by clicking, rather than by writing one into storage from a test.
 *
 * Like the AI suite it drives the Expo *dev* server, so every navigation parses
 * an unminified bundle — slow enough on a small CI runner that the default
 * timeouts are not survivable.
 */
const appOrigin = 'http://127.0.0.1:8083';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e/studio',
  testMatch: /release\.spec\.ts/,
  timeout: isCI ? 180_000 : 90_000,
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: isCI ? 30_000 : 10_000 },
  use: {
    baseURL: appOrigin,
    ...devices['Desktop Chrome'],
    actionTimeout: isCI ? 30_000 : 0,
    navigationTimeout: isCI ? 90_000 : 0,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/expo/bin/cli start --web --port 8083 --offline',
    url: appOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Metro reports bundling failures on stdout, which Playwright discards by
    // default. Without this a broken bundle is invisible: the dev server keeps
    // answering, the browser gets a 500, and every test sees a blank page.
    stdout: 'pipe',
    env: { ...process.env, CI: '1' },
  },
});
