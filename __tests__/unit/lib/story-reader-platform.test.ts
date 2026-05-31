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

  it('falls back to black when no colors provided', () => {
    expect(getStoryReaderContainerStyle()).toEqual({
      backgroundColor: '#000000',
      overflow: 'hidden',
    });
  });

  it('uses theme foreground color when provided for speaker text', () => {
    expect(getStoryReaderSpeakerTextStyle({ foreground: 'oklch(22% 0.02 80)' })).toEqual({
      color: 'oklch(22% 0.02 80)',
    });
  });

  it('falls back to white for speaker text when no colors provided', () => {
    expect(getStoryReaderSpeakerTextStyle()).toEqual({
      color: '#ffffff',
    });
  });
});
