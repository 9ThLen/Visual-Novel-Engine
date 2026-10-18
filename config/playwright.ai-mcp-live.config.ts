import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * One real MCP client against the real bridge, started the way an author
 * starts it for an agent of their own: `--provider none --mcp`.
 *
 * Opt-in and not free: the client is the author's own Claude Code or Codex,
 * signed in, and the run spends a little of that account. Nothing of the
 * author's bridge is touched — the bridge here keeps its settings in a fresh
 * directory, takes two one-off tokens, and listens on a port of its own.
 *
 * The config is read again in the worker. What has to agree between the two
 * readings is put in the environment the first time, and the worker, started
 * from that environment, finds it there.
 */
const REPO_ROOT = path.resolve(__dirname, '..');

const client = process.env.AI_MCP_CLIENT;
if (client !== 'claude' && client !== 'codex') {
  throw new Error('Set AI_MCP_CLIENT=claude or AI_MCP_CLIENT=codex');
}

process.env.AI_MCP_LIVE_TOKEN ||= randomBytes(24).toString('hex');
process.env.AI_MCP_LIVE_MCP_TOKEN ||= randomBytes(24).toString('hex');
process.env.AI_MCP_LIVE_BRIDGE_HOME ||= mkdtempSync(path.join(tmpdir(), 'vne-mcp-live-'));
process.env.AI_MCP_LIVE_BRIDGE ||= '127.0.0.1:18790';

const appOrigin = 'http://127.0.0.1:8081';
const bridgePort = Number(process.env.AI_MCP_LIVE_BRIDGE.split(':')[1]);

export default defineConfig({
  outputDir: path.resolve(REPO_ROOT, 'test-results'),
  testDir: '../tests/e2e/ai',
  testMatch: /live-mcp\.spec\.ts/,
  workers: 1,
  reporter: 'list',
  expect: { timeout: 20_000 },
  use: { baseURL: appOrigin, ...devices['Desktop Chrome'], trace: 'retain-on-failure', actionTimeout: 30_000, navigationTimeout: 120_000 },
  webServer: [
    {
      command: `pnpm ai-bridge --provider none --mcp --port ${bridgePort} --origin ${appOrigin}`,
      cwd: REPO_ROOT,
      port: bridgePort,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        VNE_BRIDGE_HOME: process.env.AI_MCP_LIVE_BRIDGE_HOME,
        AI_BRIDGE_TOKEN: process.env.AI_MCP_LIVE_TOKEN,
        AI_BRIDGE_MCP_TOKEN: process.env.AI_MCP_LIVE_MCP_TOKEN,
      },
    },
    {
      command: 'node node_modules/expo/bin/cli start --web --port 8081 --offline',
      cwd: REPO_ROOT,
      url: appOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...process.env, CI: '1' },
    },
  ],
});
