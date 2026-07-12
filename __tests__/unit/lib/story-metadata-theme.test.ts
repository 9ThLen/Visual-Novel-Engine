import { exportStory, importStory } from '@/lib/story-hooks';
import {
  StoryDomain,
  normalizeStoryMetadata,
  type StoryMetadata,
} from '@/lib/story-domain';
import { buildPersistedAppState, mergePersistedAppState } from '@/lib/app-store-persistence';
import { useAppStore } from '@/stores/use-app-store';
import { createStorySlice } from '@/stores/app-store-slices/story-slice';

const VALID_THEME = {
  dialogueBg: '#112233',
  choiceText: '#ffffff',
} as const;

function canonicalSceneMap() {
  return {
    'scene-1': {
      id: 'scene-1',
      storyId: 'seed-story',
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
  };
}

describe('normalizeStoryMetadata', () => {
  it('keeps a valid theme, normalizing color casing/shorthand', () => {
    const meta = normalizeStoryMetadata({
      id: 's',
      title: 'T',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
      theme: { dialogueBg: '#ABC' } as StoryMetadata['theme'],
    });
    expect(meta.theme).toEqual({ dialogueBg: '#aabbcc' });
  });

  it('drops the theme key entirely when the theme is broken', () => {
    const meta = normalizeStoryMetadata({
      id: 's',
      title: 'T',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
      theme: { dialogueBg: 'not-a-color', junk: 5 } as unknown as StoryMetadata['theme'],
    });
    expect(meta.theme).toBeUndefined();
    expect('theme' in meta).toBe(false);
  });

  it('leaves metadata without a theme untouched (no empty object)', () => {
    const meta = normalizeStoryMetadata({
      id: 's',
      title: 'T',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
    });
    expect(meta.theme).toBeUndefined();
    expect('theme' in meta).toBe(false);
  });

  it('is idempotent', () => {
    const once = normalizeStoryMetadata({
      id: 's',
      title: 'T',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
      theme: VALID_THEME as StoryMetadata['theme'],
    });
    expect(normalizeStoryMetadata(once)).toEqual(once);
  });
});

describe('StoryDomain.extractMetadata', () => {
  it('passes a theme through the spread', () => {
    const meta = StoryDomain.extractMetadata({
      id: 's',
      title: 'T',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      theme: VALID_THEME,
      scenes: {},
    } as never);
    expect(meta.theme).toEqual(VALID_THEME);
  });
});

describe('importStory theme handling', () => {
  beforeEach(() => {
    useAppStore.setState({
      storiesMetadata: [],
      sceneRecordsByStory: {},
      characterLibraries: {},
    });
  });

  it('round-trips a valid theme through export then import', async () => {
    useAppStore.setState({
      storiesMetadata: [
        {
          id: 'seed-story',
          title: 'Themed Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
          theme: { ...VALID_THEME },
        },
      ],
      sceneRecordsByStory: { 'seed-story': canonicalSceneMap() as never },
      characterLibraries: {},
    });

    const exportedJson = await exportStory('seed-story', useAppStore.getState());
    expect(JSON.parse(exportedJson).theme).toEqual(VALID_THEME);

    const reimported = await importStory(exportedJson);
    const meta = useAppStore.getState().storiesMetadata.find((s) => s.id === reimported.id);
    expect(meta?.theme).toEqual(VALID_THEME);
  });

  it('sanitizes a broken imported theme without throwing', async () => {
    const imported = await importStory(JSON.stringify({
      title: 'Broken Theme',
      startSceneId: 'scene-1',
      theme: { dialogueBg: 'red', choiceText: 'rgb(1,2,3)', dialogueText: 42, junk: '#abcdef' },
      scenes: { 'scene-1': { id: 'scene-1', timeline: [] } },
    }));

    const meta = useAppStore.getState().storiesMetadata.find((s) => s.id === imported.id);
    expect(meta?.theme).toBeUndefined();
    expect('theme' in (meta ?? {})).toBe(false);
  });

  it('omits theme entirely when the import has none', async () => {
    const imported = await importStory(JSON.stringify({
      title: 'No Theme',
      startSceneId: 'scene-1',
      scenes: { 'scene-1': { id: 'scene-1', timeline: [] } },
    }));

    const meta = useAppStore.getState().storiesMetadata.find((s) => s.id === imported.id);
    expect(meta?.theme).toBeUndefined();
    expect('theme' in (meta ?? {})).toBe(false);
  });

  it('keeps a partial valid theme on a broken-key import', async () => {
    const imported = await importStory(JSON.stringify({
      title: 'Mixed Theme',
      startSceneId: 'scene-1',
      theme: { dialogueBg: '#010203', nameText: 'not-a-color' },
      scenes: { 'scene-1': { id: 'scene-1', timeline: [] } },
    }));

    const meta = useAppStore.getState().storiesMetadata.find((s) => s.id === imported.id);
    expect(meta?.theme).toEqual({ dialogueBg: '#010203' });
  });
});

describe('persist hydration theme normalization', () => {
  it('normalizes a broken theme from an old persisted device', () => {
    useAppStore.setState({ storiesMetadata: [] });
    const rehydrated = mergePersistedAppState(
      {
        storiesMetadata: [
          {
            id: 'story-1',
            title: 'Story',
            startSceneId: 'scene-1',
            createdAt: 1,
            updatedAt: 1,
            sceneCount: 1,
            theme: { dialogueBg: 'rgb(1,2,3)', bogus: true },
          },
          {
            id: 'story-2',
            title: 'Story 2',
            startSceneId: 'scene-1',
            createdAt: 1,
            updatedAt: 1,
            sceneCount: 1,
            theme: { dialogueText: '#ABCDEF' },
          },
        ],
      },
      useAppStore.getState(),
    ) as { storiesMetadata: StoryMetadata[] };

    expect(rehydrated.storiesMetadata[0].theme).toBeUndefined();
    expect('theme' in rehydrated.storiesMetadata[0]).toBe(false);
    expect(rehydrated.storiesMetadata[1].theme).toEqual({ dialogueText: '#abcdef' });
  });

  it('does not resurrect an explicitly cleared theme after persist and rehydrate', () => {
    const story = {
      id: 'story-clear',
      title: 'Clear theme',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
      theme: { dialogueBg: '#123456' },
    } as StoryMetadata;
    useAppStore.setState({ storiesMetadata: [story] });

    createStorySlice(useAppStore.setState as never)
      .updateStoryMetadata('story-clear', { theme: undefined });
    const persisted = JSON.parse(JSON.stringify(buildPersistedAppState(useAppStore.getState())));
    const rehydrated = mergePersistedAppState(persisted, useAppStore.getState());

    expect(rehydrated.storiesMetadata.find((item) => item.id === 'story-clear')?.theme).toBeUndefined();
  });
});
