import type { BridgeImageProvider, BridgeProvider } from '../../../lib/bridge-protocol';

export type ImageProviderSelection = BridgeImageProvider | 'auto' | 'none';

export interface ResolvedImageProvider {
  provider?: BridgeImageProvider;
  configured: boolean;
  alternativeProvider?: BridgeImageProvider;
}

export function parseImageProviderSelection(value: string | undefined): ImageProviderSelection {
  const normalized = (value ?? 'auto').trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'none' || normalized === 'openai' || normalized === 'gemini') {
    return normalized;
  }
  throw new Error('AI bridge image provider must be "auto", "openai", "gemini", or "none"');
}

/**
 * Auto keeps API providers native. CLI providers preserve the former OpenAI
 * image behaviour when both keys exist, then fall back to Gemini.
 */
export function resolveImageProvider(
  selection: ImageProviderSelection,
  chatProvider: BridgeProvider,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedImageProvider {
  if (selection === 'none') return { configured: false };
  if (selection === 'openai' || selection === 'gemini') {
    const key = selection === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY;
    return { provider: selection, configured: Boolean(key?.trim()) };
  }

  if (chatProvider === 'gemini') {
    const configured = Boolean(env.GEMINI_API_KEY?.trim());
    return {
      provider: 'gemini',
      configured,
      ...(!configured && env.OPENAI_API_KEY?.trim() ? { alternativeProvider: 'openai' as const } : {}),
    };
  }
  if (chatProvider === 'openai') {
    const configured = Boolean(env.OPENAI_API_KEY?.trim());
    return {
      provider: 'openai',
      configured,
      ...(!configured && env.GEMINI_API_KEY?.trim() ? { alternativeProvider: 'gemini' as const } : {}),
    };
  }
  if (env.OPENAI_API_KEY?.trim()) return { provider: 'openai', configured: true };
  if (env.GEMINI_API_KEY?.trim()) return { provider: 'gemini', configured: true };
  return { configured: false };
}

export function imageProviderLabel(provider: BridgeImageProvider): string {
  return provider === 'gemini' ? 'Google Gemini Images' : 'OpenAI Images';
}
