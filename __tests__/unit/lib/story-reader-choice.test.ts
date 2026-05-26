import { describe, expect, it } from 'vitest';

import { getChoiceTransitionTarget } from '@/lib/story-reader-choice';

describe('story reader choice', () => {
  it('reads targetSceneId from executor choices', () => {
    expect(
      getChoiceTransitionTarget({
        targetSceneId: 'scene-2',
      }),
    ).toBe('scene-2');
  });

  it('falls back to nextSceneId for legacy choice shape', () => {
    expect(
      getChoiceTransitionTarget({
        nextSceneId: 'scene-3',
      }),
    ).toBe('scene-3');
  });
});
