import { replaceConnectionByOutputPort } from '@/lib/scene-operations';

describe('scene connection replacement', () => {
  it('replaces an existing connection with the same output port', () => {
    expect(replaceConnectionByOutputPort([
      { targetSceneId: 'scene-2', outputPort: 'next', label: 'Old' },
      { targetSceneId: 'scene-2', outputPort: 'choice_a', label: 'Choice A' },
    ], {
      targetSceneId: 'scene-3',
      outputPort: 'next',
      label: 'Next',
    })).toEqual([
      { targetSceneId: 'scene-2', outputPort: 'choice_a', label: 'Choice A' },
      { targetSceneId: 'scene-3', outputPort: 'next', label: 'Next' },
    ]);
  });
});
