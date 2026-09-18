import type { BridgeProvider } from '../bridge-protocol';

export type AiProviderSetupStep =
  | { kind: 'command'; value: string }
  | { kind: 'note'; translationKey: string };

export type AiProviderInfo = {
  label: string;
  badge?: 'recommended' | 'beta';
  visible: boolean;
  setup: readonly AiProviderSetupStep[];
};

export const AI_PROVIDER_INFO: Record<BridgeProvider, AiProviderInfo> = {
  openai: {
    label: 'OpenAI API',
    badge: 'recommended',
    visible: true,
    setup: [{ kind: 'note', translationKey: 'aiChat.providerSetup.openai' }],
  },
  anthropic: {
    label: 'Claude API',
    badge: 'recommended',
    visible: true,
    setup: [{ kind: 'note', translationKey: 'aiChat.providerSetup.anthropic' }],
  },
  gemini: {
    label: 'Google Gemini',
    visible: true,
    setup: [{ kind: 'note', translationKey: 'aiChat.providerSetup.gemini' }],
  },
  claude: {
    label: 'Claude Code',
    visible: true,
    setup: [
      { kind: 'command', value: 'npm install -g @anthropic-ai/claude-code' },
      { kind: 'command', value: 'claude' },
    ],
  },
  codex: {
    label: 'Codex CLI Beta',
    badge: 'beta',
    visible: false,
    setup: [
      { kind: 'command', value: 'npm install -g @openai/codex' },
      { kind: 'command', value: 'codex login' },
    ],
  },
};

export const VISIBLE_AI_PROVIDERS = (Object.keys(AI_PROVIDER_INFO) as BridgeProvider[])
  .filter(provider => AI_PROVIDER_INFO[provider].visible);

export function isBridgeProvider(value: unknown): value is BridgeProvider {
  return typeof value === 'string' && value in AI_PROVIDER_INFO;
}

/**
 * The providers an author can configure by typing a key, in the studio or
 * through `vne-ai-bridge --save-key`.
 *
 * Here rather than in the bridge because both sides need the same answer and
 * the bridge already reads this file: the studio decides whether to show the key
 * field, and `key-command.ts` decides whether to accept one. Those two
 * disagreeing is a field that saves into a rejection.
 *
 * `claude` and `codex` are absent on purpose. They authenticate through their
 * own CLI, where a key typed here would go nowhere.
 */
export const KEYED_AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type KeyedBridgeProvider = (typeof KEYED_AI_PROVIDERS)[number];

export function isKeyedBridgeProvider(value: unknown): value is KeyedBridgeProvider {
  return (KEYED_AI_PROVIDERS as readonly unknown[]).includes(value);
}

export function aiProviderLabel(provider?: BridgeProvider): string {
  return provider ? AI_PROVIDER_INFO[provider].label : 'AI';
}
