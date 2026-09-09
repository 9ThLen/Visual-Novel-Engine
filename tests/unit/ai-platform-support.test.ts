import { getAiPlatformSupport } from '@/lib/ai/platform-support';

describe('AI platform support', () => {
  it('supports a loopback desktop web origin with WebSocket', () => {
    expect(getAiPlatformSupport({
      platformOS: 'web',
      origin: 'http://localhost:8081',
      hasWebSocket: true,
    })).toEqual({ supported: true, reason: 'supported' });
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
