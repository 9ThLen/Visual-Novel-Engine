import type { BridgeProvider } from '../../../lib/bridge-protocol';

export interface BridgeStartupSummary {
  origins: readonly string[];
  port: number;
  provider: BridgeProvider;
  token: string;
}

export function formatBridgeStartupBlock(options: BridgeStartupSummary): string {
  return [
    '================ AI BRIDGE PAIRING ================',
    `Provider: ${options.provider === 'claude' ? 'Claude Code' : 'Codex'}`,
    `URL: ws://127.0.0.1:${options.port}`,
    `Allowed origins: ${options.origins.join(', ')}`,
    `Token: ${options.token}`,
    "Paste this token into the editor's AI panel.",
    '===================================================',
  ].join('\n');
}
