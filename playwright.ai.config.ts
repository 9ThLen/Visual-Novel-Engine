import { defineConfig, devices } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:8081';

// The suite drives the Expo *dev* server, so every navigation parses and runs an
// unminified bundle. On a two-core CI runner that costs ~13s before the first
// screen paints (measured at 6x CPU throttling: `load` at 5.4s, first button at
// 13.3s), which silently blew past Playwright's 5s default expect timeout and
// made every test fail on a blank page. Give the app room on CI.
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e/ai',
  testMatch: /browser\.spec\.ts/,
  timeout: isCI ? 180_000 : 60_000,
  globalSetup: './e2e/ai/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: isCI ? 30_000 : 5_000 },
  use: {
    baseURL: appOrigin,
    ...devices['Desktop Chrome'],
    actionTimeout: isCI ? 30_000 : 0,
    navigationTimeout: isCI ? 90_000 : 0,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node node_modules/tsx/dist/cli.mjs e2e/ai/fake-bridge.ts',
      url: 'http://127.0.0.1:18788/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'node node_modules/expo/bin/cli start --web --port 8081 --offline',
      url: appOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        CI: '1',
        EXPO_PUBLIC_AI_BRIDGE_TOKEN: '',
        EXPO_PUBLIC_AI_BRIDGE_URL: 'ws://127.0.0.1:18787',
      },
    },
  ],
});
