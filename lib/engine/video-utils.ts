import type { NormalizedVideoBlockData } from './types';

export const DEFAULT_VIDEO_PLAYBACK_RATE = 1;
export const MIN_VIDEO_PLAYBACK_RATE = 0.5;
export const MAX_VIDEO_PLAYBACK_RATE = 2;

function nullableId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeVideoData(raw: unknown): NormalizedVideoBlockData {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const mode = record.mode === 'stop' ? 'stop' : 'play';
  const layer = record.layer === 'cutscene' ? 'cutscene' : 'background';

  if (mode === 'stop') {
    return {
      mode,
      layer,
      assetId: null,
      posterAssetId: null,
      fit: 'cover',
      playbackRate: DEFAULT_VIDEO_PLAYBACK_RATE,
      startAt: 0,
      endAt: null,
      muted: true,
      volume: 0,
      loop: false,
      skippableAfterMs: null,
    };
  }

  const startAt = Math.max(0, finiteNumber(record.startAt, 0));
  const rawEndAt = finiteNumber(record.endAt, Number.NaN);
  const endAt = Number.isFinite(rawEndAt) && rawEndAt > startAt ? rawEndAt : null;
  const playbackRate = clamp(
    finiteNumber(record.playbackRate, DEFAULT_VIDEO_PLAYBACK_RATE),
    MIN_VIDEO_PLAYBACK_RATE,
    MAX_VIDEO_PLAYBACK_RATE,
  );
  const volume = clamp(finiteNumber(record.volume, 1), 0, 1);
  const rawSkippableAfterMs = finiteNumber(record.skippableAfterMs, Number.NaN);

  if (layer === 'background') {
    return {
      mode,
      layer,
      assetId: nullableId(record.assetId),
      posterAssetId: nullableId(record.posterAssetId),
      fit: record.fit === 'contain' ? 'contain' : 'cover',
      playbackRate,
      startAt,
      endAt,
      muted: true,
      volume: 0,
      loop: true,
      skippableAfterMs: null,
    };
  }

  return {
    mode,
    layer,
    assetId: nullableId(record.assetId),
    posterAssetId: nullableId(record.posterAssetId),
    fit: record.fit === 'contain' ? 'contain' : 'cover',
    playbackRate,
    startAt,
    endAt,
    muted: record.muted === true,
    volume,
    loop: false,
    skippableAfterMs: Number.isFinite(rawSkippableAfterMs)
      ? Math.max(0, Math.round(rawSkippableAfterMs))
      : null,
  };
}
