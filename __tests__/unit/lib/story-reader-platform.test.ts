import { describe, expect, it } from 'vitest';

import {
  getStoryReaderContainerStyle,
  getStoryReaderSpeakerTextStyle,
} from '@/lib/story-reader-platform';

describe('story reader platform styles', () => {
  it('uses an explicit dark background for the root container', () => {
    expect(getStoryReaderContainerStyle()).toEqual({
      backgroundColor: '#000000',
      overflow: 'hidden',
    });
  });

  it('uses an explicit light color for the speaker label', () => {
    expect(getStoryReaderSpeakerTextStyle()).toEqual({
      color: '#ffffff',
    });
  });
});
