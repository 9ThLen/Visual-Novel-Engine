import { exportStory, importStory } from '@/lib/story-hooks';
import { CHARACTER_AUTHORING_SCHEMA_VERSION } from '@/lib/character-migration';
import { useAppStore } from '@/stores/use-app-store';

describe('importStory', () => {
  beforeEach(() => {
    useAppStore.setState({
      storiesMetadata: [],
      sceneRecordsByStory: {},
      characterLibraries: {},
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

  it('preserves canonical character library metadata on import', async () => {
    const imported = await importStory(JSON.stringify({
      title: 'Character Import',
      startSceneId: 'scene-1',
      characterLibrary: [
        {
          id: 'char_masha',
          name: 'Маша',
          color: '#ff4d6d',
          sprites: [{ id: 'sprite_1', name: 'Main', uri: 'file://sprite.png', createdAt: 1 }],
          defaultSpriteId: 'sprite_1',
          authoring: { currentSpriteId: 'sprite_1', currentPosition: 'left', focusOnSpeak: true },
          createdAt: 1,
        },
      ],
      scenes: {
        'scene-1': {
          id: 'scene-1',
          timeline: [],
        },
      },
    }));

    const library = useAppStore.getState().characterLibraries[imported.id];
    expect(library[0].name).toBe('Маша');
    expect(library[0].color).toBe('#ff4d6d');
    expect(library[0].sprites[0].name).toBe('Main');
    expect(library[0].authoring?.currentSpriteId).toBe('sprite_1');
    expect(imported.characterAuthoringSchemaVersion).toBe(CHARACTER_AUTHORING_SCHEMA_VERSION);
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

  it('exports character colors, sprite names, and authoring metadata', async () => {
    useAppStore.setState({
      storiesMetadata: [{
        id: 'story_1',
        title: 'Exportable',
        startSceneId: 'scene-1',
        createdAt: 1,
        updatedAt: 1,
        sceneCount: 1,
      }],
      sceneRecordsByStory: {
        story_1: {
          'scene-1': {
            id: 'scene-1',
            storyId: 'story_1',
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
      },
      characterLibraries: {
        story_1: [{
          id: 'char_masha',
          name: 'Маша',
          color: '#ff4d6d',
          sprites: [{ id: 'sprite_1', name: 'Main', uri: 'file://sprite.png', createdAt: 1 }],
          defaultSpriteId: 'sprite_1',
          authoring: { currentSpriteId: 'sprite_1', currentPosition: 'center', focusOnSpeak: true },
          createdAt: 1,
        }],
      },
    });

    const exported = JSON.parse(await exportStory('story_1', useAppStore.getState()));

    expect(exported.characterLibrary[0].color).toBe('#ff4d6d');
    expect(exported.characterLibrary[0].sprites[0].name).toBe('Main');
    expect(exported.characterLibrary[0].authoring.currentSpriteId).toBe('sprite_1');
    expect(exported.characterAuthoringSchemaVersion).toBe(CHARACTER_AUTHORING_SCHEMA_VERSION);
  });
});
