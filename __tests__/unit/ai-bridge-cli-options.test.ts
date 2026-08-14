// @vitest-environment node
import { bridgeCliHelp, parseBridgeCliArgs, resolveBridgeCliConfig } from '../../tools/ai-bridge/src/cli-options';
import { resolveImageProvider } from '../../tools/ai-bridge/src/image-provider-config';
import { normalizeLoopbackOrigin } from '../../tools/ai-bridge/src/origin-policy';

describe('AI bridge CLI options', () => {
  it('parses provider, port and repeated origins', () => {
    expect(parseBridgeCliArgs([
      '--provider', 'codex',
      '--enable-codex-beta',
      '--port=9000',
      '--origin', 'http://localhost:8092',
      '--origin=http://127.0.0.1:8092',
    ])).toEqual({
      provider: 'codex',
      port: '9000',
      origins: ['http://localhost:8092', 'http://127.0.0.1:8092'],
      help: false,
      enableCodexBeta: true,
    });
  });

  it('uses CLI values before environment values and replaces lower-priority origins', () => {
    const config = resolveBridgeCliConfig(
      parseBridgeCliArgs(['--provider', 'codex', '--enable-codex-beta', '--port', '9000', '--origin', 'http://localhost:8092']),
      {
        AI_BRIDGE_PROVIDER: 'claude',
        AI_BRIDGE_PORT: '7000',
        AI_BRIDGE_ALLOWED_ORIGINS: 'http://127.0.0.1:7000',
      },
    );
    expect(config).toEqual({
      provider: 'codex',
      imageProvider: 'auto',
      port: 9000,
      origins: ['http://localhost:8092'],
      enableCodexBeta: true,
    });
  });

  it('uses environment values before defaults', () => {
    expect(resolveBridgeCliConfig(parseBridgeCliArgs([]), {
      AI_BRIDGE_PROVIDER: 'codex',
      AI_BRIDGE_PORT: '9001',
      AI_BRIDGE_ALLOWED_ORIGINS: 'http://localhost:8093,http://127.0.0.1:8093',
      AI_BRIDGE_ENABLE_CODEX_BETA: '1',
    })).toEqual({
      provider: 'codex',
      imageProvider: 'auto',
      port: 9001,
      origins: ['http://localhost:8093', 'http://127.0.0.1:8093'],
      enableCodexBeta: true,
    });
  });

  it('defaults only to the Expo origins on port 8081', () => {
    expect(resolveBridgeCliConfig(parseBridgeCliArgs([]), {})).toMatchObject({
      provider: 'claude',
      imageProvider: 'auto',
      port: 8787,
      origins: ['http://localhost:8081', 'http://127.0.0.1:8081'],
    });
  });

  it.each([
    'https://example.com',
    'ws://localhost:8081',
    'http://localhost:8081/path',
    'http://user@localhost:8081',
    'http://localhost:8081?',
  ])('rejects non-loopback or non-origin value %s', value => {
    expect(() => normalizeLoopbackOrigin(value)).toThrow(/loopback http\/https origin/);
  });

  it('accepts and canonicalizes exact IPv4, IPv6 and localhost origins', () => {
    expect(normalizeLoopbackOrigin('HTTP://LOCALHOST:8081')).toBe('http://localhost:8081');
    expect(normalizeLoopbackOrigin('https://127.0.0.1:443')).toBe('https://127.0.0.1');
    expect(normalizeLoopbackOrigin('http://[::1]:8081')).toBe('http://[::1]:8081');
  });

  it('rejects invalid providers and ports', () => {
    expect(() => resolveBridgeCliConfig({ help: false, provider: 'unknown' }, {})).toThrow(/provider/);
    expect(() => resolveBridgeCliConfig({ help: false, port: '0' }, {})).toThrow(/port/);
    expect(() => resolveBridgeCliConfig({ help: false, port: '8787x' }, {})).toThrow(/port/);
  });

  it('prints the supported options in help', () => {
    expect(bridgeCliHelp()).toContain('--provider <claude|openai|codex|gemini>');
    expect(bridgeCliHelp()).toContain('--enable-codex-beta');
    expect(bridgeCliHelp()).toContain('--image-provider <auto|openai|gemini|none>');
    expect(bridgeCliHelp()).toContain('--origin <origin>');
    expect(bridgeCliHelp()).toContain('--port <port>');
  });

  it('resolves image auto deterministically and preserves OpenAI priority for CLI providers', () => {
    const both = { OPENAI_API_KEY: 'openai', GEMINI_API_KEY: 'gemini' };
    expect(resolveImageProvider('auto', 'gemini', both)).toEqual({ provider: 'gemini', configured: true });
    expect(resolveImageProvider('auto', 'openai', both)).toEqual({ provider: 'openai', configured: true });
    expect(resolveImageProvider('auto', 'claude', both)).toEqual({ provider: 'openai', configured: true });
    expect(resolveImageProvider('auto', 'codex', { GEMINI_API_KEY: 'gemini' })).toEqual({ provider: 'gemini', configured: true });
    expect(resolveImageProvider('auto', 'gemini', { OPENAI_API_KEY: 'openai' })).toEqual({
      provider: 'gemini', configured: false, alternativeProvider: 'openai',
    });
    expect(resolveImageProvider('none', 'gemini', both)).toEqual({ configured: false });
  });

  it('parses explicit image provider CLI configuration before the environment', () => {
    const config = resolveBridgeCliConfig(
      parseBridgeCliArgs(['--image-provider', 'gemini']),
      { AI_BRIDGE_IMAGE_PROVIDER: 'openai' },
    );
    expect(config.imageProvider).toBe('gemini');
    expect(() => resolveBridgeCliConfig({ help: false, imageProvider: 'unknown' }, {})).toThrow(/image provider/);
  });
});
