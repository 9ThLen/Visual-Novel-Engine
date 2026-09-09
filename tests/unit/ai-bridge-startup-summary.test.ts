// @vitest-environment node
import { formatBridgeStartupBlock } from '../../tools/ai-bridge/src/startup-summary';

describe('AI bridge startup summary', () => {
  it.each([
    ['claude', 'Claude Code'],
    ['openai', 'OpenAI API'],
    ['gemini', 'Google Gemini'],
    ['codex', 'Codex CLI Beta'],
  ] as const)('prints the %s provider accurately', (provider, label) => {
    const output = formatBridgeStartupBlock({
      provider,
      port: 9000,
      origins: ['http://localhost:8081', 'http://127.0.0.1:8081'],
      token: 'pair-me',
    });
    expect(output.match(/Provider:/g)).toHaveLength(1);
    expect(output).toContain('Image provider: Disabled');
    expect(output.match(/URL:/g)).toHaveLength(1);
    expect(output.match(/Allowed origins:/g)).toHaveLength(1);
    expect(output.match(/Token:/g)).toHaveLength(1);
    expect(output).toContain(`Provider: ${label}`);
    expect(output).toContain('URL: ws://127.0.0.1:9000');
    expect(output).toContain('Token: pair-me');
  });

  it('prints the actual configured image backend', () => {
    const output = formatBridgeStartupBlock({
      provider: 'claude',
      imageProvider: 'gemini',
      imageProviderConfigured: true,
      port: 9000,
      origins: ['http://localhost:8081'],
      token: 'pair-me',
    });
    expect(output).toContain('Image provider: Google Gemini Images');
  });

  it('explains how to opt into an available non-native image backend', () => {
    const output = formatBridgeStartupBlock({
      provider: 'gemini',
      imageProvider: 'gemini',
      imageProviderConfigured: false,
      imageProviderAlternative: 'openai',
      port: 9000,
      origins: ['http://localhost:8081'],
      token: 'pair-me',
    });
    expect(output).toContain('Image provider: Google Gemini Images (missing API key)');
    expect(output).toContain('restart with --image-provider openai');
  });
});
