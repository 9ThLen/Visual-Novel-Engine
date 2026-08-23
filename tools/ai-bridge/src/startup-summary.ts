import type { BridgeImageProvider, BridgeProvider } from '../../../lib/bridge-protocol';
import { aiProviderLabel } from '../../../lib/ai/providers';
import { imageProviderLabel } from './image-provider-config';

export interface BridgeStartupSummary {
  origins: readonly string[];
  port: number;
  provider: BridgeProvider;
  fallbackProvider?: BridgeProvider;
  imageProvider?: BridgeImageProvider;
  imageProviderConfigured?: boolean;
  imageProviderAlternative?: BridgeImageProvider;
  token: string;
}

export function formatBridgeStartupBlock(options: BridgeStartupSummary): string {
  return [
    '================ AI BRIDGE PAIRING ================',
    `Provider: ${aiProviderLabel(options.provider)}`,
    `Fallback: ${options.fallbackProvider ? `${aiProviderLabel(options.fallbackProvider)} (pre-output only; cross-provider consent enabled)` : 'Disabled'}`,
    `Image provider: ${options.imageProvider ? `${imageProviderLabel(options.imageProvider)}${options.imageProviderConfigured === false ? ' (missing API key)' : ''}` : 'Disabled'}`,
    ...(options.imageProviderConfigured === false && options.imageProviderAlternative
      ? [`Image hint: ${imageProviderLabel(options.imageProviderAlternative)} is configured; restart with --image-provider ${options.imageProviderAlternative} to use it.`]
      : []),
    `URL: ws://127.0.0.1:${options.port}`,
    `Allowed origins: ${options.origins.join(', ')}`,
    `Token: ${options.token}`,
    "Paste this token into the editor's AI panel.",
    '===================================================',
  ].join('\n');
}
