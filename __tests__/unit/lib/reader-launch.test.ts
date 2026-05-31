import { parseResumeExisting, shouldReusePlaybackState } from '@/lib/reader-launch';

describe('reader-launch', () => {
  it('parses resume flag from route params', () => {
    expect(parseResumeExisting('1')).toBe(true);
    expect(parseResumeExisting('true')).toBe(true);
    expect(parseResumeExisting('0')).toBe(false);
    expect(parseResumeExisting(undefined)).toBe(false);
  });

  it('reuses playback state only for explicit resume launches', () => {
    const playbackState = {
      storyId: 'story-1',
      currentSceneId: 'scene-13',
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: [],
    };

    expect(shouldReusePlaybackState(playbackState, 'story-1', true)).toBe(true);
    expect(shouldReusePlaybackState(playbackState, 'story-1', false)).toBe(false);
    expect(shouldReusePlaybackState(playbackState, 'story-2', true)).toBe(false);
  });
});
