import { spawnSync } from 'node:child_process';
import { ClaudeAgentProvider } from './claude-provider';
import { CodexCliProvider } from './codex-provider';
import { AiBridgeServer } from './server';

async function main(): Promise<void> {
  const port = Number.parseInt(process.env.AI_BRIDGE_PORT ?? '8787', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AI_BRIDGE_PORT must be a valid TCP port');
  const origins = (process.env.AI_BRIDGE_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const provider = (process.env.AI_BRIDGE_PROVIDER ?? 'claude').toLowerCase();
  if (provider !== 'claude' && provider !== 'codex') throw new Error('AI_BRIDGE_PROVIDER must be "claude" or "codex"');
  const command = provider === 'codex' ? (process.platform === 'win32' ? 'codex.exe' : 'codex') : (process.platform === 'win32' ? 'claude.cmd' : 'claude');
  const checkArgs = provider === 'codex' ? ['login', 'status'] : ['auth', 'status'];
  const check = spawnSync(command, checkArgs, { encoding: 'utf8', shell: false });
  if (check.error?.message.includes('ENOENT') || check.status !== 0) {
    console.error(provider === 'codex'
      ? 'Codex CLI is missing or unavailable. Install it, then run: codex login'
      : 'Claude Code CLI is missing or not authenticated. Install it, then run: claude auth login');
    process.exitCode = 1;
    return;
  }
  const server = new AiBridgeServer({
    port,
    allowedOrigins: origins,
    providerFactory: tools => provider === 'codex' ? new CodexCliProvider(tools) : new ClaudeAgentProvider(tools),
  });
  await server.start();
  let stopping = false;
  process.on('SIGINT', () => { if (stopping) return; stopping = true; void server.close().finally(() => process.exit(0)); });
}

void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
