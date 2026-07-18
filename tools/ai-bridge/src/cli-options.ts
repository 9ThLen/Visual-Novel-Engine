import { parseArgs } from 'node:util';
import { defaultAllowedOrigins, normalizeAllowedOrigins } from './origin-policy';
import type { BridgeProvider } from '../../../lib/bridge-protocol';

export interface BridgeCliArgs {
  provider?: string;
  origins?: string[];
  port?: string;
  help: boolean;
  version?: boolean;
  enableCodexBeta?: boolean;
}

export interface BridgeCliConfig {
  provider: BridgeProvider;
  origins: string[];
  port: number;
  enableCodexBeta: boolean;
}

export function parseBridgeCliArgs(args: readonly string[]): BridgeCliArgs {
  const parsed = parseArgs({
    args: [...args],
    allowPositionals: false,
    strict: true,
    options: {
      provider: { type: 'string' },
      origin: { type: 'string', multiple: true },
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      'enable-codex-beta': { type: 'boolean' },
    },
  });

  return {
    provider: parsed.values.provider,
    origins: parsed.values.origin,
    port: parsed.values.port,
    help: parsed.values.help ?? false,
    ...(parsed.values.version ? { version: true } : {}),
    ...(parsed.values['enable-codex-beta'] ? { enableCodexBeta: true } : {}),
  };
}

export function resolveBridgeCliConfig(
  cli: BridgeCliArgs,
  env: Readonly<Record<string, string | undefined>>,
): BridgeCliConfig {
  const providerValue = (cli.provider ?? env.AI_BRIDGE_PROVIDER ?? 'claude').toLowerCase();
  if (providerValue !== 'claude' && providerValue !== 'openai' && providerValue !== 'codex') {
    throw new Error('AI bridge provider must be "claude", "openai", or "codex"');
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
  return { provider: providerValue, origins, port, enableCodexBeta };
}

export function bridgeCliHelp(): string {
  return [
    'Usage: vne-ai-bridge [options]',
    '',
    'Options:',
    '  --provider <claude|openai|codex>  AI provider (default: claude)',
    '  --enable-codex-beta        Explicitly enable experimental Codex CLI',
    '  --origin <origin>          Allowed loopback browser origin; repeatable',
    '  --port <port>              Bridge WebSocket port (default: 8787)',
    '  -h, --help                 Show this help',
    '  -v, --version              Show the bridge version',
    '',
    'CLI options override AI_BRIDGE_PROVIDER, AI_BRIDGE_ALLOWED_ORIGINS, and AI_BRIDGE_PORT.',
  ].join('\n');
}
