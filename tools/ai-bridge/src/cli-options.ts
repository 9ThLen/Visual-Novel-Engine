import { parseArgs } from 'node:util';
import { defaultAllowedOrigins, normalizeAllowedOrigins } from './origin-policy';
import type { BridgeProvider } from '../../../src/lib/bridge-protocol';
import { parseImageProviderSelection, type ImageProviderSelection } from './image-provider-config';

export interface BridgeCliArgs {
  provider?: string;
  fallbackProvider?: string;
  imageProvider?: string;
  origins?: string[];
  port?: string;
  help: boolean;
  version?: boolean;
  enableCodexBeta?: boolean;
  resetToken?: boolean;
  /** Offer the tools to an external agent over MCP. */
  mcp?: boolean;
  resetMcpToken?: boolean;
  /** Seal the API key arriving on standard input, then exit. */
  saveKey?: string;
}

/** `none` is a bridge without chat: it starts no model and answers only an external agent. */
export type BridgeCliProvider = BridgeProvider | 'none';

export interface BridgeCliConfig {
  provider: BridgeCliProvider;
  fallbackProvider?: 'gemini';
  imageProvider: ImageProviderSelection;
  origins: string[];
  port: number;
  enableCodexBeta: boolean;
  /** Set only when the MCP endpoint is on. */
  mcp?: boolean;
}

export function parseBridgeCliArgs(args: readonly string[]): BridgeCliArgs {
  const parsed = parseArgs({
    args: [...args],
    allowPositionals: false,
    strict: true,
    options: {
      provider: { type: 'string' },
      'fallback-provider': { type: 'string' },
      'image-provider': { type: 'string' },
      origin: { type: 'string', multiple: true },
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      'enable-codex-beta': { type: 'boolean' },
      'reset-token': { type: 'boolean' },
      mcp: { type: 'boolean' },
      'reset-mcp-token': { type: 'boolean' },
      'save-key': { type: 'string' },
    },
  });

  return {
    provider: parsed.values.provider,
    ...(parsed.values['fallback-provider'] ? { fallbackProvider: parsed.values['fallback-provider'] } : {}),
    ...(parsed.values['image-provider'] ? { imageProvider: parsed.values['image-provider'] } : {}),
    origins: parsed.values.origin,
    port: parsed.values.port,
    help: parsed.values.help ?? false,
    ...(parsed.values.version ? { version: true } : {}),
    ...(parsed.values['enable-codex-beta'] ? { enableCodexBeta: true } : {}),
    ...(parsed.values['reset-token'] ? { resetToken: true } : {}),
    ...(parsed.values.mcp ? { mcp: true } : {}),
    ...(parsed.values['reset-mcp-token'] ? { resetMcpToken: true } : {}),
    ...(parsed.values['save-key'] ? { saveKey: parsed.values['save-key'] } : {}),
  };
}

export function resolveBridgeCliConfig(
  cli: BridgeCliArgs,
  env: Readonly<Record<string, string | undefined>>,
): BridgeCliConfig {
  const providerValue = (cli.provider ?? env.AI_BRIDGE_PROVIDER ?? 'claude').toLowerCase();
  if (providerValue !== 'claude' && providerValue !== 'anthropic' && providerValue !== 'openai' && providerValue !== 'codex' && providerValue !== 'gemini' && providerValue !== 'none') {
    throw new Error('AI bridge provider must be "claude", "anthropic", "openai", "codex", "gemini", or "none"');
  }
  const mcp = cli.mcp ?? env.AI_BRIDGE_MCP === '1';
  if (providerValue === 'none' && !mcp) {
    throw new Error('--provider none needs --mcp: a bridge with no chat and no external agent has nothing to do');
  }
  const fallbackValue = cli.fallbackProvider?.toLowerCase();
  if (fallbackValue !== undefined && fallbackValue !== 'gemini') {
    throw new Error('AI bridge fallback provider must be "gemini"');
  }
  if (fallbackValue && providerValue !== 'openai') {
    throw new Error('Cross-provider fallback currently requires --provider openai --fallback-provider gemini');
  }

  const portValue = cli.port ?? env.AI_BRIDGE_PORT ?? '8787';
  if (!/^\d+$/.test(portValue)) throw new Error('AI bridge port must be a valid TCP port');
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('AI bridge port must be a valid TCP port');
  }

  const envOrigins = (env.AI_BRIDGE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const origins = cli.origins !== undefined
    ? normalizeAllowedOrigins(cli.origins)
    : envOrigins.length > 0
      ? normalizeAllowedOrigins(envOrigins)
      : defaultAllowedOrigins();

  const enableCodexBeta = cli.enableCodexBeta ?? env.AI_BRIDGE_ENABLE_CODEX_BETA === '1';
  if (providerValue === 'codex' && !enableCodexBeta) {
    throw new Error('Codex CLI Beta requires --enable-codex-beta');
  }
  const imageProvider = parseImageProviderSelection(cli.imageProvider ?? env.AI_BRIDGE_IMAGE_PROVIDER);
  return { provider: providerValue, ...(fallbackValue ? { fallbackProvider: fallbackValue } : {}), imageProvider, origins, port, enableCodexBeta, ...(mcp ? { mcp: true } : {}) };
}

export function bridgeCliHelp(): string {
  return [
    'Usage: vne-ai-bridge [options]',
    '',
    'Options:',
    '  --provider <claude|anthropic|openai|codex|gemini|none>  AI provider (default: claude)',
    '                             "claude" is Claude Code and needs that CLI; "anthropic" is the',
    '                             Claude API and needs only a key; "none" starts no model and',
    '                             serves only an external agent (needs --mcp)',
    '  --mcp                      Offer the editor to an agent of your own over MCP, at /mcp on the',
    '                             same port, behind its own token. Off unless asked for',
    '  --fallback-provider <gemini>  Explicitly consent to pre-output OpenAI -> Gemini fallback',
    '  --image-provider <auto|openai|gemini|none>  Image backend (default: auto)',
    '  --enable-codex-beta        Explicitly enable experimental Codex CLI',
    '  --origin <origin>          Allowed loopback browser origin; repeatable',
    '  --port <port>              Bridge WebSocket port (default: 8787)',
    '  --reset-token              Issue a new pairing token and exit',
    '  --reset-mcp-token          Issue a new MCP token and exit',
    '  --save-key <anthropic|openai|gemini>  Read an API key from standard input, protect it for',
    '                             your account, select that provider, and exit',
    '  -h, --help                 Show this help',
    '  -v, --version              Show the bridge version',
    '',
    'Fallback is CLI-only: using --fallback-provider explicitly allows prior chat and attachments to be sent to Gemini.',
    'CLI options override AI_BRIDGE_PROVIDER, AI_BRIDGE_IMAGE_PROVIDER, AI_BRIDGE_ALLOWED_ORIGINS, AI_BRIDGE_PORT, and AI_BRIDGE_MCP=1.',
    'Those in turn override the settings file in the bridge directory; set VNE_BRIDGE_HOME to move it.',
  ].join('\n');
}
