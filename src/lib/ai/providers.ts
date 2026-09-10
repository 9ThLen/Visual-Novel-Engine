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

export function aiProviderLabel(provider?: BridgeProvider): string {
  return provider ? AI_PROVIDER_INFO[provider].label : 'AI';
}
