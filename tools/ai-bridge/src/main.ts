import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { ClaudeAgentProvider } from './claude-provider';
import { CodexCliProvider } from './codex-provider';
import { AiBridgeServer } from './server';

/**
 * Minimal `.env` loader (tsx does not read `.env` on its own, and we don't want
 * a dependency for four dev-only keys). Loads KEY=VALUE lines from the project
 * root without overriding anything already set in the real environment.
 */
function loadDotEnv(): void {
  try {
    const raw = readFileSync(fileURLToPath(new URL('../../../.env', import.meta.url)), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match || line.trimStart().startsWith('#')) continue;
      const key = match[1];
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env file — rely on the real environment. This is fine.
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const port = Number.parseInt(process.env.AI_BRIDGE_PORT ?? '8787', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AI_BRIDGE_PORT must be a valid TCP port');
  const origins = (process.env.AI_BRIDGE_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const provider = (process.env.AI_BRIDGE_PROVIDER ?? 'claude').toLowerCase();
  if (provider !== 'claude' && provider !== 'codex') throw new Error('AI_BRIDGE_PROVIDER must be "claude" or "codex"');
  const command = provider === 'codex' ? (process.platform === 'win32' ? 'codex.exe' : 'codex') : (process.platform === 'win32' ? 'claude.cmd' : 'claude');
  const checkArgs = provider === 'codex' ? ['login', 'status'] : ['auth', 'status'];
  // Windows needs shell:true to launch a .cmd shim (Node blocks .cmd/.bat under
  // shell:false with EINVAL). Args are fixed constants, so there is nothing to escape.
  const check = spawnSync(command, checkArgs, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (check.error?.message.includes('ENOENT') || check.status !== 0) {
    console.error(provider === 'codex'
      ? 'Codex CLI is missing or unavailable. Install it, then run: codex login'
      : 'Claude Code CLI is missing or not authenticated. Install it, then run: claude auth login');
    process.exitCode = 1;
    return;
  }
  // A fixed token lets the browser and bridge share one value from .env. Falls
  // back to the browser-facing key, then to a random token if neither is set.
  const token = process.env.AI_BRIDGE_TOKEN ?? process.env.EXPO_PUBLIC_AI_BRIDGE_TOKEN;
  const server = new AiBridgeServer({
    port,
    token,
    allowedOrigins: origins,
    providerFactory: tools => provider === 'codex' ? new CodexCliProvider(tools) : new ClaudeAgentProvider(tools),
  });
  await server.start();
  let stopping = false;
  process.on('SIGINT', () => { if (stopping) return; stopping = true; void server.close().finally(() => process.exit(0)); });
}

void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
