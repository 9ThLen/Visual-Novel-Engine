import { StoryValidator } from '@/lib/story-validator';

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
