import {
  DEFAULT_AI_BRIDGE_URL,
  normalizeLocalBridgeUrl,
  resolveAiBridgeConfig,
  selectAiBridgeAgentOnly,
  selectAiBridgeProvider,
  updateActiveAiBridgeProfile,
  withActiveAiBridgeProfileStored,
  type AiBridgeSettings,
} from '@/lib/ai/bridge-config';

describe('AI bridge config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers persisted values over environment values', () => {
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_URL', 'ws://localhost:9000');
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_TOKEN', 'env-token');

    expect(
      resolveAiBridgeConfig({
        url: ' ws://127.0.0.1:9999 ',
        token: ' store-token ',
        disabled: false,
      }),
    ).toEqual({
      url: 'ws://127.0.0.1:9999',
      token: 'store-token',
      enabled: true,
      preferredProvider: 'openai',
    });
  });

  it('uses environment values and the default URL when persisted values are empty', () => {
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_TOKEN', 'env-token');

    expect(resolveAiBridgeConfig({ url: '', token: '', disabled: false })).toEqual({
      url: DEFAULT_AI_BRIDGE_URL,
      token: 'env-token',
      enabled: true,
      preferredProvider: 'openai',
    });
  });

  it('blocks an environment token when the persisted settings are disabled', () => {
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_URL', 'ws://localhost:9000');
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_TOKEN', 'env-token');

    expect(resolveAiBridgeConfig({ url: '', token: '', disabled: true })).toEqual({
      url: 'ws://localhost:9000',
      token: 'env-token',
      enabled: false,
      preferredProvider: 'openai',
    });
  });

  it('keeps URL, token, model and budget separate for each provider', () => {
    const openAi = {
      url: 'ws://127.0.0.1:8787',
      token: 'openai-token',
      disabled: false,
      preferredProvider: 'openai' as const,
      requestedModel: 'gpt-test',
      requestedTokenBudget: 1000,
      profiles: { gemini: { url: 'ws://127.0.0.1:8788', token: 'gemini-token', requestedModel: 'gemini-test', requestedTokenBudget: 2000 } },
    };
    expect(selectAiBridgeProvider(openAi, 'gemini')).toMatchObject({
      preferredProvider: 'gemini',
      url: 'ws://127.0.0.1:8788',
      token: 'gemini-token',
      requestedModel: 'gemini-test',
      requestedTokenBudget: 2000,
      profiles: { openai: { url: 'ws://127.0.0.1:8787', token: 'openai-token', requestedModel: 'gpt-test', requestedTokenBudget: 1000 } },
    });
  });

  it('does not auto-connect when an environment URL is not local', () => {
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_URL', 'ws://example.com:8787');
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_TOKEN', 'env-token');

    expect(resolveAiBridgeConfig({ url: '', token: '', disabled: false })).toEqual({
      url: 'ws://example.com:8787',
      token: 'env-token',
      enabled: false,
      preferredProvider: 'openai',
    });
  });

  it.each([
    ['', DEFAULT_AI_BRIDGE_URL],
    [' ws://LOCALHOST:8787/ ', 'ws://localhost:8787'],
    ['ws://127.0.0.1:9000', 'ws://127.0.0.1:9000'],
    ['ws://[::1]:8787/', 'ws://[::1]:8787'],
  ])('normalizes a local bridge URL: %s', (value, expected) => {
    expect(normalizeLocalBridgeUrl(value)).toEqual({ ok: true, url: expected });
  });

  it.each([
    ['not a url', 'INVALID_URL'],
    ['http://localhost:8787', 'UNSUPPORTED_PROTOCOL'],
    ['wss://localhost:8787', 'UNSUPPORTED_PROTOCOL'],
    ['ws://192.168.1.10:8787', 'NON_LOCAL_HOST'],
    ['ws://example.com:8787', 'NON_LOCAL_HOST'],
    ['ws://user:secret@localhost:8787', 'CREDENTIALS_NOT_ALLOWED'],
    ['ws://localhost:8787/socket', 'URL_COMPONENTS_NOT_ALLOWED'],
    ['ws://localhost:8787?token=secret', 'URL_COMPONENTS_NOT_ALLOWED'],
    ['ws://localhost:8787#bridge', 'URL_COMPONENTS_NOT_ALLOWED'],
  ])('rejects an unsafe bridge URL: %s', (value, reason) => {
    expect(normalizeLocalBridgeUrl(value)).toEqual({ ok: false, reason });
  });
});

/**
 * Connecting for an external agent only is not one more provider. It has an
 * address and a token of its own, and names no provider to the bridge.
 */
describe('the agent-only connection among the bridge settings', () => {
  const chat: AiBridgeSettings = {
    url: 'ws://127.0.0.1:8787',
    token: 'openai-token',
    disabled: false,
    preferredProvider: 'openai',
    requestedModel: 'gpt-x',
    profiles: { gemini: { url: 'ws://127.0.0.1:9001', token: 'gemini-token' } },
  };

  it('starts empty, and keeps the provider’s address and token for the way back', () => {
    const agent = selectAiBridgeAgentOnly(chat);

    expect(agent).toMatchObject({ agentOnly: true, url: '', token: '', disabled: false });
    expect(agent.requestedModel).toBeUndefined();
    expect(agent.profiles?.openai).toEqual({ url: 'ws://127.0.0.1:8787', token: 'openai-token', requestedModel: 'gpt-x' });
    expect(agent.profiles?.gemini).toEqual(chat.profiles?.gemini);
    expect(selectAiBridgeAgentOnly(agent)).toBe(agent);
  });

  it('files what is typed for the agent under the agent, and under no provider', () => {
    const agent = updateActiveAiBridgeProfile(selectAiBridgeAgentOnly(chat), { url: 'ws://127.0.0.1:8899', token: 'agent-pairing' });

    expect(agent).toMatchObject({ url: 'ws://127.0.0.1:8899', token: 'agent-pairing', agentProfile: { url: 'ws://127.0.0.1:8899', token: 'agent-pairing' } });
    expect(JSON.stringify(agent.profiles)).not.toContain('agent-pairing');
    expect(withActiveAiBridgeProfileStored({ ...agent, token: 'rotated' }).agentProfile).toEqual({ url: 'ws://127.0.0.1:8899', token: 'rotated' });
    expect(JSON.stringify(withActiveAiBridgeProfileStored({ ...agent, token: 'rotated' }).profiles)).not.toContain('rotated');
  });

  it('gives each side its own back when the author switches between them', () => {
    const agent = updateActiveAiBridgeProfile(selectAiBridgeAgentOnly(chat), { url: 'ws://127.0.0.1:8899', token: 'agent-pairing' });

    const back = selectAiBridgeProvider(agent, 'openai');
    expect(back).toMatchObject({ agentOnly: false, preferredProvider: 'openai', url: 'ws://127.0.0.1:8787', token: 'openai-token', requestedModel: 'gpt-x' });
    expect(back.agentProfile).toEqual({ url: 'ws://127.0.0.1:8899', token: 'agent-pairing' });

    expect(selectAiBridgeAgentOnly(back)).toMatchObject({ agentOnly: true, url: 'ws://127.0.0.1:8899', token: 'agent-pairing' });
  });

  it('names no provider, no model and no budget to the bridge', () => {
    const agent = updateActiveAiBridgeProfile(selectAiBridgeAgentOnly({ ...chat, requestedTokenBudget: 5000 }), { token: 'agent-pairing' });

    expect(resolveAiBridgeConfig({ ...agent, requestedModel: 'left-over', requestedTokenBudget: 5000 })).toEqual({
      url: 'ws://127.0.0.1:8787', token: 'agent-pairing', enabled: true, agentOnly: true,
    });
  });

  it('says nothing of an agent-only connection where there is none', () => {
    expect(resolveAiBridgeConfig(chat)).not.toHaveProperty('agentOnly');
    expect(resolveAiBridgeConfig(chat).preferredProvider).toBe('openai');
  });
});
