import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * The config lives in `config/`, and Playwright anchors `webServer.cwd` on the
 * config file's own directory. Every server here is a repo-root command.
 */
const REPO_ROOT = path.resolve(__dirname, '..');

const provider = process.env.AI_E2E_PROVIDER;
if (provider !== 'claude' && provider !== 'codex') {
  throw new Error('Set AI_E2E_PROVIDER=claude or AI_E2E_PROVIDER=codex');
}

const token = process.env.AI_BRIDGE_TOKEN || 'ai-live-smoke-local-token';
const appOrigin = 'http://127.0.0.1:8081';

export default defineConfig({
  outputDir: path.resolve(REPO_ROOT, 'test-results'),
  testDir: '../tests/e2e/ai',
  testMatch: /live\.spec\.ts/,
  workers: 1,
  reporter: 'list',
  use: { baseURL: appOrigin, ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: [
    {
      command: `pnpm ai-bridge --provider ${provider} --origin ${appOrigin}`,
      cwd: REPO_ROOT,
      port: 8787,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...process.env, AI_BRIDGE_TOKEN: token },
    },
    {
      command: 'node node_modules/expo/bin/cli start --web --port 8081 --offline',
      cwd: REPO_ROOT,
      url: appOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        CI: '1',
        EXPO_PUBLIC_AI_BRIDGE_TOKEN: token,
        EXPO_PUBLIC_AI_BRIDGE_URL: 'ws://127.0.0.1:8787',
      },
    },
  ],
});
