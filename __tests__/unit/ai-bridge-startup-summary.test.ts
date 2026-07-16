// @vitest-environment node
import { formatBridgeStartupBlock } from '../../tools/ai-bridge/src/startup-summary';

describe('AI bridge startup summary', () => {
  it('prints provider, URL, origins and token exactly once', () => {
    const output = formatBridgeStartupBlock({
      provider: 'codex',
      port: 9000,
      origins: ['http://localhost:8081', 'http://127.0.0.1:8081'],
      token: 'pair-me',
    });
    expect(output.match(/Provider:/g)).toHaveLength(1);
    expect(output.match(/URL:/g)).toHaveLength(1);
    expect(output.match(/Allowed origins:/g)).toHaveLength(1);
    expect(output.match(/Token:/g)).toHaveLength(1);
    expect(output).toContain('Provider: Codex');
    expect(output).toContain('URL: ws://127.0.0.1:9000');
    expect(output).toContain('Token: pair-me');
  });
});
