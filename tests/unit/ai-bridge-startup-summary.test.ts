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

  it('says nothing about an external agent when MCP is off', () => {
    const output = formatBridgeStartupBlock({ provider: 'claude', port: 9000, origins: ['http://localhost:8081'], token: 'pair-me' });

    expect(output).not.toContain('MCP');
    expect(output).not.toContain('/mcp');
  });

  it('prints what an agent needs when MCP is on, ready to paste', () => {
    const output = formatBridgeStartupBlock({ provider: 'claude', port: 9000, origins: ['http://localhost:8081'], token: 'pair-me', mcpToken: 'agent-key' });

    expect(output).toContain('MCP endpoint: http://127.0.0.1:9000/mcp');
    expect(output).toContain('MCP token: agent-key');
    expect(output).toContain('MCP header: Authorization: Bearer agent-key');
    expect(output).toContain('claude mcp add --transport http visual-novel http://127.0.0.1:9000/mcp --header "Authorization: Bearer agent-key"');
    // The editor's token is still there, and is not the agent's.
    expect(output).toContain('Token: pair-me');
    expect(output.match(/pair-me/g)).toHaveLength(1);
  });

  it('names no provider for a bridge that runs without chat', () => {
    const output = formatBridgeStartupBlock({ port: 9000, origins: ['http://localhost:8081'], token: 'pair-me', mcpToken: 'agent-key' });

    expect(output).toContain('Provider: None (no chat; external agent only)');
    expect(output).toContain('Image provider: Disabled');
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
