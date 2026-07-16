import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ClaudeAgentProvider } from './claude-provider';
import { CodexCliProvider } from './codex-provider';
import { AiBridgeServer } from './server';
import { bridgeCliHelp, parseBridgeCliArgs, resolveBridgeCliConfig } from './cli-options';
import { checkProviderAuthentication } from './cli-launcher';
import { formatBridgeStartupBlock } from './startup-summary';
import { CODEX_HARDENING_REASON, getCodexHardeningCapability } from './codex-launch-policy';

export const BRIDGE_CLI_VERSION = '0.1.0';

/**
 * Minimal `.env` loader (tsx does not read `.env` on its own, and we don't want
 * a dependency for four dev-only keys). Loads KEY=VALUE lines from the project
 * root without overriding anything already set in the real environment.
 */
function loadDotEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
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
  const cli = parseBridgeCliArgs(process.argv.slice(2));
  if (cli.help) {
    console.log(bridgeCliHelp());
    return;
  }
  if (cli.version) {
    console.log(BRIDGE_CLI_VERSION);
    return;
  }

  loadDotEnv();
  const { origins, port, provider } = resolveBridgeCliConfig(cli, process.env);
  if (provider === 'codex') {
    const capability = getCodexHardeningCapability();
    if (!capability.supported) {
      console.error(`[${CODEX_HARDENING_REASON}] ${capability.message}`);
      process.exitCode = 1;
      return;
    }
  }
  const check = checkProviderAuthentication(provider);
  if (check.error || check.status !== 0) {
    const detail = check.error?.message || check.stderr?.trim() || check.stdout?.trim();
    console.error(provider === 'codex'
      ? 'Codex CLI is missing or unavailable. Install @openai/codex, then run: codex login'
      : 'Claude Code CLI is missing or not authenticated. Install @anthropic-ai/claude-code, then run: claude');
    if (detail) console.error(`Provider diagnostic: ${detail}`);
    process.exitCode = 1;
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn('Image diagnostic: OPENAI_API_KEY is not set; image generation and editing will be unavailable.');
  }
  // A fixed token lets the browser and bridge share one value from .env. Falls
  // back to the browser-facing key, then to a random token if neither is set.
  const token = process.env.AI_BRIDGE_TOKEN ?? process.env.EXPO_PUBLIC_AI_BRIDGE_TOKEN;
  const server = new AiBridgeServer({
    port,
    token,
    provider,
    allowedOrigins: origins,
    providerFactory: (tools, session) => provider === 'codex' ? new CodexCliProvider(tools, session) : new ClaudeAgentProvider(tools, session),
  });
  const listeningPort = await server.start();
  console.log(formatBridgeStartupBlock({
    token: server.token,
    port: listeningPort,
    provider,
    origins,
  }));
  let stopping = false;
  process.on('SIGINT', () => { if (stopping) return; stopping = true; void server.close().finally(() => process.exit(0)); });
}

void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
