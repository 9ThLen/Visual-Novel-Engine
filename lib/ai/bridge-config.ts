export const DEFAULT_AI_BRIDGE_URL = 'ws://127.0.0.1:8787';

export type AiBridgeSettings = {
  url: string;
  token: string;
  disabled: boolean;
  preferredProvider?: BridgeProvider;
  codexBetaConsent?: CodexBetaConsent;
};

export type ResolvedAiBridgeConfig = {
  url: string;
  token: string;
  enabled: boolean;
  preferredProvider: BridgeProvider;
  codexBetaConsent?: CodexBetaConsent;
};

export type NormalizeLocalBridgeUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

const LOCAL_BRIDGE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeLocalBridgeUrl(value: string): NormalizeLocalBridgeUrlResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, url: DEFAULT_AI_BRIDGE_URL };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'INVALID_URL' };
  }

  if (parsed.protocol !== 'ws:') {
    return { ok: false, reason: 'UNSUPPORTED_PROTOCOL' };
  }
  if (!LOCAL_BRIDGE_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { ok: false, reason: 'NON_LOCAL_HOST' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'CREDENTIALS_NOT_ALLOWED' };
  }
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    return { ok: false, reason: 'URL_COMPONENTS_NOT_ALLOWED' };
  }

  return { ok: true, url: `${parsed.protocol}//${parsed.host}` };
}

export function resolveAiBridgeConfig(
  settings?: Partial<AiBridgeSettings>,
): ResolvedAiBridgeConfig {
  const urlCandidate =
    settings?.url?.trim() ||
    process.env.EXPO_PUBLIC_AI_BRIDGE_URL?.trim() ||
    DEFAULT_AI_BRIDGE_URL;
  const normalizedUrl = normalizeLocalBridgeUrl(urlCandidate);
  const token =
    settings?.token?.trim() ||
    process.env.EXPO_PUBLIC_AI_BRIDGE_TOKEN?.trim() ||
    '';

  return {
    url: normalizedUrl.ok ? normalizedUrl.url : urlCandidate,
    token,
    enabled: normalizedUrl.ok && settings?.disabled !== true && token.length > 0,
    preferredProvider: settings?.preferredProvider ?? 'openai',
    ...(settings?.codexBetaConsent ? { codexBetaConsent: settings.codexBetaConsent } : {}),
  };
}
import type { BridgeProvider, CodexBetaConsent } from '@/lib/bridge-protocol';
