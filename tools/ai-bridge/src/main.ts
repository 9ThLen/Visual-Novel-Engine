import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { ClaudeAgentProvider } from './claude-provider';
import { CodexCliProvider } from './codex-provider';
import { AiBridgeServer } from './server';
import { bridgeCliHelp, parseBridgeCliArgs, resolveBridgeCliConfig } from './cli-options';
import { checkProviderAuthentication } from './cli-launcher';
import { formatBridgeStartupBlock } from './startup-summary';
import { OpenAiProvider } from './openai-provider';

export const BRIDGE_CLI_VERSION = '0.1.0';

// The OpenAI provider is intentionally import.meta-free so it stays loadable
// under the CommonJS test transpiler; the entrypoint owns the prompt read.
const OPENAI_SYSTEM_PROMPT = readFileSync(fileURLToPath(new URL('./system-prompt.md', import.meta.url)), 'utf8');

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
  const { origins, port, provider, enableCodexBeta } = resolveBridgeCliConfig(cli, process.env);
  const check = provider === 'claude' ? checkProviderAuthentication(provider) : null;
  if (check && (check.error || check.status !== 0)) {
    const detail = check.error?.message || check.stderr?.trim() || check.stdout?.trim();
    console.error(provider === 'codex'
      ? 'Codex CLI is missing or unavailable. Install @openai/codex, then run: codex login'
      : 'Claude Code CLI is missing or not authenticated. Install @anthropic-ai/claude-code, then run: claude');
    if (detail) console.error(`Provider diagnostic: ${detail}`);
    process.exitCode = 1;
    return;
  }
  if (provider !== 'openai' && !process.env.OPENAI_API_KEY) {
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
    enableCodexBeta,
    enableClaudeAttachments: process.env.AI_BRIDGE_ENABLE_CLAUDE_ATTACHMENTS === 'true',
    modelPolicy: provider === 'openai' ? {
      defaultModel: process.env.OPENAI_CHAT_MODEL,
      allowedModels: csv(process.env.OPENAI_ALLOWED_CHAT_MODELS),
      defaultTokenBudget: positiveNumber(process.env.OPENAI_SESSION_TOKEN_BUDGET),
      maxTokenBudget: positiveNumber(process.env.OPENAI_MAX_SESSION_TOKEN_BUDGET),
    } : undefined,
    providerFactory: (tools, session) => {
      switch (provider) {
        case 'claude': return new ClaudeAgentProvider(tools, session);
        case 'codex': return new CodexCliProvider(tools, session);
        case 'openai': return new OpenAiProvider(tools, session, {
          apiKey: process.env.OPENAI_API_KEY ?? '',
          model: session?.model ?? process.env.OPENAI_CHAT_MODEL,
          systemPrompt: OPENAI_SYSTEM_PROMPT,
          sessionTokenBudget: session?.sessionTokenBudget ?? positiveNumber(process.env.OPENAI_SESSION_TOKEN_BUDGET),
        });
      }
    },
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

function positiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}
function csv(value: string | undefined): string[] | undefined {
  const values = value?.split(',').map(item => item.trim()).filter(Boolean);
  return values?.length ? [...new Set(values)] : undefined;
}

void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
