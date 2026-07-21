import { defineConfig, devices } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:8081';

export default defineConfig({
  testDir: './e2e/ai',
  testMatch: /browser\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: appOrigin,
    ...devices['Desktop Chrome'],
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
