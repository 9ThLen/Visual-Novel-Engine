import { parseArgs } from 'node:util';
import { defaultAllowedOrigins, normalizeAllowedOrigins } from './origin-policy';
import type { BridgeProvider } from '../../../lib/bridge-protocol';

export interface BridgeCliArgs {
  provider?: string;
  origins?: string[];
  port?: string;
  help: boolean;
}

export interface BridgeCliConfig {
  provider: BridgeProvider;
  origins: string[];
  port: number;
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
    },
  });

  return {
    provider: parsed.values.provider,
    origins: parsed.values.origin,
    port: parsed.values.port,
    help: parsed.values.help ?? false,
  };
}

export function resolveBridgeCliConfig(
  cli: BridgeCliArgs,
  env: Readonly<Record<string, string | undefined>>,
): BridgeCliConfig {
  const providerValue = (cli.provider ?? env.AI_BRIDGE_PROVIDER ?? 'claude').toLowerCase();
  if (providerValue !== 'claude' && providerValue !== 'codex') {
    throw new Error('AI bridge provider must be "claude" or "codex"');
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

  return { provider: providerValue, origins, port };
}

export function bridgeCliHelp(): string {
  return [
    'Usage: pnpm ai-bridge [options]',
    '',
    'Options:',
    '  --provider <claude|codex>  AI CLI provider (default: claude)',
    '  --origin <origin>          Allowed loopback browser origin; repeatable',
    '  --port <port>              Bridge WebSocket port (default: 8787)',
    '  -h, --help                 Show this help',
    '',
    'CLI options override AI_BRIDGE_PROVIDER, AI_BRIDGE_ALLOWED_ORIGINS, and AI_BRIDGE_PORT.',
  ].join('\n');
}
