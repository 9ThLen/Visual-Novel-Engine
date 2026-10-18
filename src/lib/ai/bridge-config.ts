import type { BridgeProvider, CodexBetaConsent } from '@/lib/bridge-protocol';
export const DEFAULT_AI_BRIDGE_URL = 'ws://127.0.0.1:8787';

export type AiBridgeConnectionProfile = {
  url: string;
  token: string;
  requestedModel?: string;
  requestedTokenBudget?: number;
};

export type AiBridgeSettings = {
  url: string;
  token: string;
  disabled: boolean;
  preferredProvider?: BridgeProvider;
  profiles?: Partial<Record<BridgeProvider, AiBridgeConnectionProfile>>;
  codexBetaConsent?: CodexBetaConsent;
  requestedModel?: string;
  requestedTokenBudget?: number;
  /**
   * Connect for an external agent only: no chat, and no provider named to the
   * bridge. The bridge on the other end runs without one (`--provider none
   * --mcp`). Such a connection has an address and a token of its own, kept in
   * `agentProfile` — it is nobody's provider profile, and must never be saved
   * as one.
   */
  agentOnly?: boolean;
  agentProfile?: { url: string; token: string };
};

function activeProfile(settings: AiBridgeSettings): AiBridgeConnectionProfile {
  return {
    url: settings.url,
    token: settings.token,
    ...(settings.requestedModel ? { requestedModel: settings.requestedModel } : {}),
    ...(settings.requestedTokenBudget ? { requestedTokenBudget: settings.requestedTokenBudget } : {}),
  };
}

/**
 * Files the address and token in use under whoever they belong to: the
 * provider that is selected, or — in agent-only mode — the agent's own
 * profile. Every write of the settings goes through this, so a token typed for
 * one is never left lying in the other's profile.
 */
export function withActiveAiBridgeProfileStored(settings: AiBridgeSettings): AiBridgeSettings {
  if (settings.agentOnly) {
    return { ...settings, agentProfile: { url: settings.url, token: settings.token } };
  }
  const provider = settings.preferredProvider ?? 'openai';
  return { ...settings, profiles: { ...settings.profiles, [provider]: activeProfile(settings) } };
}

export function selectAiBridgeProvider(
  settings: AiBridgeSettings,
  provider: BridgeProvider,
): AiBridgeSettings {
  const stored = withActiveAiBridgeProfileStored(settings);
  const selected = stored.profiles?.[provider];
  return {
    ...stored,
    agentOnly: false,
    preferredProvider: provider,
    url: selected?.url ?? '',
    token: selected?.token ?? '',
    requestedModel: selected?.requestedModel,
    requestedTokenBudget: selected?.requestedTokenBudget,
    disabled: false,
  };
}

/** Switches to connecting for an external agent only, bringing back the address and token last used for that. */
export function selectAiBridgeAgentOnly(settings: AiBridgeSettings): AiBridgeSettings {
  if (settings.agentOnly) return settings;
  const stored = withActiveAiBridgeProfileStored(settings);
  return {
    ...stored,
    agentOnly: true,
    url: stored.agentProfile?.url ?? '',
    token: stored.agentProfile?.token ?? '',
    // A model and a budget are asked of a chat provider; there is none here.
    requestedModel: undefined,
    requestedTokenBudget: undefined,
    disabled: false,
  };
}

export function updateActiveAiBridgeProfile(
  settings: AiBridgeSettings,
  partial: Partial<AiBridgeConnectionProfile>,
): AiBridgeSettings {
  return withActiveAiBridgeProfileStored({ ...settings, ...partial });
}

export type ResolvedAiBridgeConfig = {
  url: string;
  token: string;
  enabled: boolean;
  /** Absent in agent-only mode: the browser then names no provider to the bridge. */
  preferredProvider?: BridgeProvider;
  /** Set only in agent-only mode. */
  agentOnly?: boolean;
  codexBetaConsent?: CodexBetaConsent;
  requestedModel?: string;
  requestedTokenBudget?: number;
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

  const connection = {
    url: normalizedUrl.ok ? normalizedUrl.url : urlCandidate,
    token,
    enabled: normalizedUrl.ok && settings?.disabled !== true && token.length > 0,
  };
  // Nothing that is said to a chat provider goes to a bridge that has none.
  if (settings?.agentOnly === true) return { ...connection, agentOnly: true };
  return {
    ...connection,
    preferredProvider: settings?.preferredProvider ?? 'openai',
    ...(settings?.codexBetaConsent ? { codexBetaConsent: settings.codexBetaConsent } : {}),
    ...(settings?.requestedModel?.trim() ? { requestedModel: settings.requestedModel.trim() } : {}),
    ...(typeof settings?.requestedTokenBudget === 'number' && settings.requestedTokenBudget > 0 ? { requestedTokenBudget: Math.floor(settings.requestedTokenBudget) } : {}),
  };
}
