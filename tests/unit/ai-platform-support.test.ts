import { getAiPlatformSupport } from '@/lib/ai/platform-support';
import { STUDIO_ORIGINS } from '@/lib/ai/studio-origins';

describe('AI platform support', () => {
  it('supports a loopback desktop web origin with WebSocket', () => {
    expect(getAiPlatformSupport({
      platformOS: 'web',
      origin: 'http://localhost:8081',
      hasWebSocket: true,
    })).toEqual({ supported: true, reason: 'supported' });
  });

  it('supports the installed studio, whose origin is not a loopback host', () => {
    expect(getAiPlatformSupport({
      platformOS: 'web',
      origin: 'http://tauri.localhost',
      hasWebSocket: true,
    })).toEqual({ supported: true, reason: 'supported' });
  });

  it('supports every origin the bridge is configured to answer', () => {
    // The two allowlists once disagreed, and this check ran first: the AI tab
    // vanished instead of a refused connection being reported. Reading the same
    // list is what keeps them together; this asserts it stays that way.
    for (const origin of STUDIO_ORIGINS) {
      expect(getAiPlatformSupport({ platformOS: 'web', origin, hasWebSocket: true }))
        .toEqual({ supported: true, reason: 'supported' });
    }
  });

  it.each([
    'http://tauri.localhost:8081',
    'https://tauri.localhost',
    'http://evil.tauri.localhost',
    'tauri://localhost',
  ])('does not admit %s alongside the measured studio origin', origin => {
    expect(getAiPlatformSupport({ platformOS: 'web', origin, hasWebSocket: true }))
      .toEqual({ supported: false, reason: 'unsupported-hosted' });
  });

  it('stays closed without WebSocket, which the bridge needs', () => {
    expect(getAiPlatformSupport({
      platformOS: 'web',
      origin: 'http://tauri.localhost',
      hasWebSocket: false,
    })).toEqual({ supported: false, reason: 'unsupported-hosted' });
  });

  it('rejects native and hosted environments explicitly', () => {
    expect(getAiPlatformSupport({ platformOS: 'android' })).toEqual({
      supported: false,
      reason: 'unsupported-native',
    });
    expect(getAiPlatformSupport({
      platformOS: 'web',
      origin: 'https://editor.example.com',
      hasWebSocket: true,
    })).toEqual({ supported: false, reason: 'unsupported-hosted' });
  });
});
