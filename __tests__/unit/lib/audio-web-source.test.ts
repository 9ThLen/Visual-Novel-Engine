import { describe, expect, it } from 'vitest';

import { getBrowserSafeAudioUri } from '@/lib/audio-web-source';

describe('audio web source', () => {
  it('rejects file uris on web', () => {
    expect(getBrowserSafeAudioUri('file:///data/user/0/app/cache/track.mp3')).toBeNull();
  });

  it('keeps browser-safe uris on web', () => {
    expect(getBrowserSafeAudioUri('https://example.com/track.mp3')).toBe(
      'https://example.com/track.mp3',
    );
    expect(getBrowserSafeAudioUri('blob:https://example.com/123')).toBe(
      'blob:https://example.com/123',
    );
    expect(getBrowserSafeAudioUri('data:audio/mp3;base64,AAAA')).toBe(
      'data:audio/mp3;base64,AAAA',
    );
  });
});
