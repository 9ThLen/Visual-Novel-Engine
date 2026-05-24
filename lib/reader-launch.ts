import type { PlaybackState } from '@/lib/types';

export function parseResumeExisting(value: string | string[] | undefined): boolean {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === '1' || normalized === 'true';
}

export function shouldReusePlaybackState(
  playbackState: PlaybackState | null | undefined,
  selectedStoryId: string,
  resumeExisting: boolean,
): boolean {
  return Boolean(resumeExisting && playbackState && playbackState.storyId === selectedStoryId);
}
