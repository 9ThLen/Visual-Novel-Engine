import {
  getStoryReaderContainerStyle,
  getStoryReaderSpeakerTextStyle,
} from '@/lib/story-reader-platform';

describe('story reader platform styles', () => {
  it('uses theme background color when provided', () => {
    expect(getStoryReaderContainerStyle({ background: 'oklch(96% 0.01 80)' })).toEqual({
      backgroundColor: 'oklch(96% 0.01 80)',
      overflow: 'hidden',
    });
  });

  it('returns null backgroundColor when no colors provided (consumer must pass colors)', () => {
    expect(getStoryReaderContainerStyle()).toEqual({
      backgroundColor: null,
      overflow: 'hidden',
    });
  });

  it('uses theme foreground color when provided for speaker text', () => {
    expect(getStoryReaderSpeakerTextStyle({ foreground: 'oklch(22% 0.02 80)' })).toEqual({
      color: 'oklch(22% 0.02 80)',
    });
  });

  it('returns null color when no colors provided (consumer must pass colors)', () => {
    expect(getStoryReaderSpeakerTextStyle()).toEqual({
      color: null,
    });
  });
});
