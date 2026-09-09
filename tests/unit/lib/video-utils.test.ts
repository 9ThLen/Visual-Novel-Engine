import { normalizeVideoData } from '@/lib/engine/video-utils';

describe('normalizeVideoData', () => {
  it('creates safe background defaults from partial data', () => {
    expect(normalizeVideoData({ assetId: ' video-1 ' })).toEqual({
      mode: 'play',
      layer: 'background',
      assetId: 'video-1',
      posterAssetId: null,
      fit: 'cover',
      playbackRate: 1,
      startAt: 0,
      endAt: null,
      muted: true,
      volume: 0,
      loop: true,
      skippableAfterMs: null,
    });
  });

  it('clamps numbers and rejects an endAt before startAt', () => {
    const normalized = normalizeVideoData({
      layer: 'cutscene',
      playbackRate: 9,
      volume: -4,
      startAt: 8,
      endAt: 7,
      skippableAfterMs: -10,
    });

    expect(normalized.playbackRate).toBe(2);
    expect(normalized.volume).toBe(0);
    expect(normalized.startAt).toBe(8);
    expect(normalized.endAt).toBeNull();
    expect(normalized.skippableAfterMs).toBe(0);
  });

  it('enforces background playback policy', () => {
    const normalized = normalizeVideoData({
      layer: 'background',
      muted: false,
      volume: 1,
      loop: false,
      skippableAfterMs: 1500,
    });

    expect(normalized).toMatchObject({ muted: true, volume: 0, loop: true, skippableAfterMs: null });
  });

  it('enforces non-looping cutscenes', () => {
    expect(normalizeVideoData({ layer: 'cutscene', loop: true }).loop).toBe(false);
  });

  it('neutralizes playback fields for stop', () => {
    expect(normalizeVideoData({
      mode: 'stop',
      layer: 'background',
      assetId: 'video-1',
      posterAssetId: 'poster-1',
      startAt: 5,
      endAt: 10,
      loop: true,
    })).toEqual({
      mode: 'stop',
      layer: 'background',
      assetId: null,
      posterAssetId: null,
      fit: 'cover',
      playbackRate: 1,
      startAt: 0,
      endAt: null,
      muted: true,
      volume: 0,
      loop: false,
      skippableAfterMs: null,
    });
  });
});
