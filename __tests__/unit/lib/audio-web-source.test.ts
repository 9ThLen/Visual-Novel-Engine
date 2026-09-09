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

  // What a bundled track actually resolves to on web. Rejecting it left every
  // bundled sound — music, voice and effects — silent in the browser build.
  it('keeps the same-origin paths bundled assets resolve to', () => {
    expect(getBrowserSafeAudioUri('/assets/?unstable_path=.%2Fassets%2Fsounds-sample/music.mp3'))
      .toBe('/assets/?unstable_path=.%2Fassets%2Fsounds-sample/music.mp3');
    expect(getBrowserSafeAudioUri('media/track.mp3')).toBe('media/track.mp3');
    expect(getBrowserSafeAudioUri('./media/track.mp3')).toBe('./media/track.mp3');
  });

  it('rejects a protocol-relative uri, which names another origin', () => {
    expect(getBrowserSafeAudioUri('//example.com/track.mp3')).toBeNull();
  });

  it('rejects schemes a browser cannot play', () => {
    expect(getBrowserSafeAudioUri('content://media/external/audio/42')).toBeNull();
    expect(getBrowserSafeAudioUri('data:text/html,<script>')).toBeNull();
  });
});
