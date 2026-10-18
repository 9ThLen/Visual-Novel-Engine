import type { BridgeImageProvider, BridgeProvider } from '../../../src/lib/bridge-protocol';
import { aiProviderLabel } from '../../../src/lib/ai/providers';
import { imageProviderLabel } from './image-provider-config';

export interface BridgeStartupSummary {
  origins: readonly string[];
  port: number;
  /** Absent on a bridge that runs without chat. */
  provider?: BridgeProvider;
  /** Present when the MCP endpoint is on. */
  mcpToken?: string;
  fallbackProvider?: BridgeProvider;
  imageProvider?: BridgeImageProvider;
  imageProviderConfigured?: boolean;
  imageProviderAlternative?: BridgeImageProvider;
  token: string;
}

/**
 * What an agent needs to reach the bridge. The last line is ready to paste for
 * the one client whose command is known; any other takes the address and the
 * header above it.
 */
function mcpLines(port: number, token: string): string[] {
  const url = `http://127.0.0.1:${port}/mcp`;
  return [
    '---------------- EXTERNAL AGENT (MCP) -------------',
    `MCP endpoint: ${url}`,
    `MCP token: ${token}`,
    `MCP header: Authorization: Bearer ${token}`,
    `Claude Code: claude mcp add --transport http visual-novel ${url} --header "Authorization: Bearer ${token}"`,
    'The agent reads the story the editor has open and proposes changes; the author applies each one in the editor.',
  ];
}

export function formatBridgeStartupBlock(options: BridgeStartupSummary): string {
  return [
    '================ AI BRIDGE PAIRING ================',
    `Provider: ${options.provider ? aiProviderLabel(options.provider) : 'None (no chat; external agent only)'}`,
    `Fallback: ${options.fallbackProvider ? `${aiProviderLabel(options.fallbackProvider)} (pre-output only; cross-provider consent enabled)` : 'Disabled'}`,
    `Image provider: ${options.imageProvider ? `${imageProviderLabel(options.imageProvider)}${options.imageProviderConfigured === false ? ' (missing API key)' : ''}` : 'Disabled'}`,
    ...(options.imageProviderConfigured === false && options.imageProviderAlternative
      ? [`Image hint: ${imageProviderLabel(options.imageProviderAlternative)} is configured; restart with --image-provider ${options.imageProviderAlternative} to use it.`]
      : []),
    `URL: ws://127.0.0.1:${options.port}`,
    `Allowed origins: ${options.origins.join(', ')}`,
    `Token: ${options.token}`,
    "Paste this token into the editor's AI panel.",
    ...(options.mcpToken ? mcpLines(options.port, options.mcpToken) : []),
    '===================================================',
  ].join('\n');
}
