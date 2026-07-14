import { exportStory, importStory } from '@/lib/story-hooks';
import { CHARACTER_AUTHORING_SCHEMA_VERSION } from '@/lib/character-migration';
import { useAppStore } from '@/stores/use-app-store';
import { setMediaBlobStorageAdapterForTests } from '@/lib/idb-storage';

const hasMediaBlob = vi.fn();
const putMediaBlob = vi.fn();

describe('importStory', () => {
  beforeEach(() => {
    hasMediaBlob.mockResolvedValue(false);
    putMediaBlob.mockResolvedValue(undefined);
    setMediaBlobStorageAdapterForTests({ has: hasMediaBlob, put: putMediaBlob });
    useAppStore.setState({
      storiesMetadata: [],
      sceneRecordsByStory: {},
      characterLibraries: {},
      audioLibraries: {},
    });
  });

  afterAll(() => {
    setMediaBlobStorageAdapterForTests(null);
  });

  it('preserves the audio library through export and import', async () => {
    useAppStore.setState({
      storiesMetadata: [{
        id: 'story-audio', title: 'Audio Story', startSceneId: 'scene-1',
        createdAt: 1, updatedAt: 1, sceneCount: 1,
      }],
      sceneRecordsByStory: {
        'story-audio': {
          'scene-1': {
            id: 'scene-1', storyId: 'story-audio', name: 'Scene 1', description: '', tags: [],
            timeline: [], flowX: 0, flowY: 0, connections: [], isStart: true,
            sceneState: {
              backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [],
              musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [],
              currentChoices: null, isTransitioning: false, transitionTarget: null,
            },
            createdAt: 1, updatedAt: 1,
          },
        },
      },
      audioLibraries: {
        'story-audio': [{
          id: 'audio-1', name: 'Rain', uri: 'file://rain.mp3', type: 'ambient', createdAt: 1,
        }],
      },
    });

    const imported = await importStory(await exportStory('story-audio', useAppStore.getState()));

    expect(imported.audioLibrary).toEqual([
      { id: 'audio-1', name: 'Rain', uri: 'file://rain.mp3', type: 'ambient', createdAt: 1 },
    ]);
    expect(useAppStore.getState().audioLibraries[imported.id]).toEqual(imported.audioLibrary);
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

  it('converts imported inline character sprites to IDB references on web', async () => {
    const imported = await importStory(JSON.stringify({
      title: 'Inline Media Import',
      startSceneId: 'scene-1',
      characterLibrary: [{
        id: 'char-1',
        name: 'Alice',
        sprites: [{
          id: 'sprite-1',
          name: 'Default',
          uri: 'data:image/png;base64,QUJD',
          createdAt: 1,
        }],
        createdAt: 1,
      }],
      scenes: { 'scene-1': { id: 'scene-1', timeline: [] } },
    }));

    expect(imported.characterLibrary?.[0].sprites[0].uri).toMatch(/^idb:\/\/media\//);
    expect(useAppStore.getState().characterLibraries[imported.id][0].sprites[0].uri)
      .toMatch(/^idb:\/\/media\//);
    expect(putMediaBlob).toHaveBeenCalledOnce();
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

  it('sanitizes and preserves tags on legacy JSON import', async () => {
    const imported = await importStory(JSON.stringify({
      id: 'legacy-story',
      title: 'Legacy Tagged',
      startSceneId: 'scene-1',
      tags: ['  Drama  ', 'drama', '', 5, 'Sci-Fi'],
      scenes: {
        'scene-1': { id: 'scene-1', text: 'Legacy text', characters: [], choices: [], musicUri: null },
      },
      createdAt: 1,
      updatedAt: 1,
    }));

    const meta = useAppStore.getState().storiesMetadata.find((s) => s.id === imported.id);
    expect(meta?.tags).toEqual(['Drama', 'Sci-Fi']);
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

  it('sanitizes tags on import: trims, drops non-strings/empties, dedupes, caps count', async () => {
    const messyTags = [
      '  Fantasy  ',
      'fantasy',            // duplicate (case-insensitive) of trimmed 'Fantasy'
      '',
      '   ',
      42,                   // non-string
      null,
      'Adventure',
      ...Array.from({ length: 30 }, (_, i) => `extra-${i}`),
    ];

    const imported = await importStory(JSON.stringify({
      title: 'Tagged Import',
      startSceneId: 'scene-1',
      tags: messyTags,
      scenes: { 'scene-1': { id: 'scene-1', timeline: [] } },
    }));

    const meta = useAppStore.getState().storiesMetadata.find((s) => s.id === imported.id);
    const tags = meta?.tags ?? [];
    expect(tags).toContain('Fantasy');
    expect(tags).toContain('Adventure');
    expect(tags.filter((tag) => tag.toLowerCase() === 'fantasy')).toHaveLength(1);
    expect(tags.every((tag) => typeof tag === 'string' && tag.trim().length > 0)).toBe(true);
    expect(tags.length).toBeLessThanOrEqual(20);
  });

  it('omits tags entirely when none are usable', async () => {
    const imported = await importStory(JSON.stringify({
      title: 'No Tags',
      startSceneId: 'scene-1',
      tags: ['', '   ', 7],
      scenes: { 'scene-1': { id: 'scene-1', timeline: [] } },
    }));

    const meta = useAppStore.getState().storiesMetadata.find((s) => s.id === imported.id);
    expect(meta?.tags).toBeUndefined();
  });

  it('round-trips tags through export then import', async () => {
    useAppStore.setState({
      storiesMetadata: [{
        id: 'story_tags',
        title: 'Tagged Story',
        tags: ['Romance', 'Mystery'],
        startSceneId: 'scene-1',
        createdAt: 1,
        updatedAt: 1,
        sceneCount: 1,
      }],
      sceneRecordsByStory: {
        story_tags: {
          'scene-1': { id: 'scene-1', storyId: 'story_tags', timeline: [] } as never,
        },
      },
      characterLibraries: {},
    });

    const exportedJson = await exportStory('story_tags', useAppStore.getState());
    expect(JSON.parse(exportedJson).tags).toEqual(['Romance', 'Mystery']);

    const reimported = await importStory(exportedJson);
    const meta = useAppStore.getState().storiesMetadata.find((s) => s.id === reimported.id);
    expect(meta?.tags).toEqual(['Romance', 'Mystery']);
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
