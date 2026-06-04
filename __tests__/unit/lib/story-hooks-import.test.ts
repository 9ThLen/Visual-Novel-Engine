import { importStory } from '@/lib/story-hooks';
import { useAppStore } from '@/stores/use-app-store';

describe('importStory', () => {
  beforeEach(() => {
    useAppStore.setState({
      storiesMetadata: [],
      sceneRecordsByStory: {},
    });
  });

  it('returns a canonical story for canonical JSON', async () => {
    const imported = await importStory(JSON.stringify({
      title: 'Canonical Import',
      description: 'desc',
      author: 'author',
      startSceneId: 'scene-1',
      scenes: {
        'scene-1': {
          id: 'scene-1',
          storyId: 'old-story',
          name: 'Scene 1',
          description: '',
          tags: [],
          timeline: [],
          sceneState: {
            backgroundAssetId: null,
            backgroundTransition: 'fade',
            characters: [],
            activeEffects: [],
            musicTrackId: null,
            musicPlaying: false,
            musicVolume: 1,
            variables: {},
            dialogueHistory: [],
            currentChoices: null,
            isTransitioning: false,
            transitionTarget: null,
          },
          flowX: 0,
          flowY: 0,
          connections: [],
          isStart: true,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    }));

    expect(imported.title).toBe('Canonical Import');
    expect(Array.isArray(imported.scenes['scene-1'].timeline)).toBe(true);
    expect(imported.scenes['scene-1'].storyId).toBe(imported.id);
    expect(imported.sceneCount).toBe(1);
  });

  it('returns a canonical story for legacy JSON', async () => {
    const imported = await importStory(JSON.stringify({
      id: 'legacy-story',
      title: 'Legacy Import',
      startSceneId: 'scene-1',
      scenes: {
        'scene-1': {
          id: 'scene-1',
          text: 'Legacy text',
          characters: [],
          choices: [],
          musicUri: null,
        },
      },
      createdAt: 1,
      updatedAt: 1,
    }));

    expect(imported.title).toBe('Legacy Import');
    expect(imported.scenes['scene-1'].storyId).toBe(imported.id);
    expect(imported.scenes['scene-1'].timeline.some((step) => step.blockType === 'text')).toBe(true);
    expect(imported.sceneCount).toBe(1);
  });

  it('rejects unsafe canonical thumbnail URIs', async () => {
    await expect(importStory(JSON.stringify({
      title: 'Unsafe Import',
      startSceneId: 'scene-1',
      thumbnailUri: 'javascript:alert(1)',
      scenes: {
        'scene-1': {
          id: 'scene-1',
          timeline: [],
        },
      },
    }))).rejects.toThrow('unsafe thumbnailUri');
  });

  it('skips invalid canonical timeline steps while keeping valid steps', async () => {
    const imported = await importStory(JSON.stringify({
      title: 'Mixed Import',
      startSceneId: 'scene-1',
      scenes: {
        'scene-1': {
          id: 'scene-1',
          timeline: [
            {
              id: 'bad-step',
              blockType: 'unknown',
              data: {},
              collapsed: false,
              enabled: true,
            },
            {
              id: 'text-step',
              blockType: 'text',
              data: {
                content: 'Safe text',
                typewriterSpeed: 0.5,
                anchorTo: 'background',
              },
              collapsed: false,
              enabled: true,
            },
          ],
        },
      },
    }));

    expect(imported.scenes['scene-1'].timeline.some((step) => step.id === 'text-step')).toBe(true);
    expect(imported.scenes['scene-1'].timeline.some((step) => step.id === 'bad-step')).toBe(false);
  });
});
