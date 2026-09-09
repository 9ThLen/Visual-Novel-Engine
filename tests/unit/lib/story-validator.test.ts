import { isSafeUri, StoryValidator } from '@/lib/story-validator';

describe('safe URI validation', () => {
  it('allows only scoped IndexedDB media references', () => {
    expect(isSafeUri('idb://media/asset-key')).toBe(true);
    expect(isSafeUri('idb://other/asset-key')).toBe(false);
    expect(isSafeUri('idb://media/../secret')).toBe(false);
  });
});

describe('StoryValidator', () => {
  it('preserves safe character presentation fields', () => {
    const story = StoryValidator.validateStory({
      id: 'story-1',
      title: 'Character Demo',
      startSceneId: 'scene-1',
      scenes: {
        'scene-1': {
          id: 'scene-1',
          text: 'Character calibration.',
          characters: [
            {
              id: 'char-demo',
              name: 'Demo Character',
              uri: 'assets/charakters/char-demo.png',
              position: 'right',
              scale: 1.15,
              expression: 'welcoming',
            },
          ],
          choices: [],
        },
      },
    });

    expect(story.scenes['scene-1'].characters[0]).toMatchObject({
      id: 'char-demo',
      name: 'Demo Character',
      uri: 'assets/charakters/char-demo.png',
      position: 'right',
      scale: 1.15,
      expression: 'welcoming',
    });
  });
});
