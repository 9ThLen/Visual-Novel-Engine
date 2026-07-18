import {
  DEFAULT_AI_BRIDGE_URL,
  normalizeLocalBridgeUrl,
  resolveAiBridgeConfig,
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
