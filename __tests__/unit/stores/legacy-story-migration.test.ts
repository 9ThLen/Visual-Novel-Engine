import { STORAGE_KEYS } from '@/lib/storage-keys';

describe('legacy story migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('isolates a corrupt scene blob and still migrates valid stories', async () => {
    localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify([
      {
        id: 'story-good',
        title: 'Good',
        startSceneId: 'scene-good',
        createdAt: 1,
        updatedAt: 1,
        sceneCount: 1,
      },
      {
        id: 'story-bad',
        title: 'Bad',
        startSceneId: 'scene-bad',
        createdAt: 1,
        updatedAt: 1,
        sceneCount: 1,
      },
    ]));
    localStorage.setItem(STORAGE_KEYS.SCENES('story-good'), JSON.stringify({
      'scene-good': {
        id: 'scene-good',
        storyId: 'story-good',
        name: 'Good scene',
        text: 'Hello',
        choices: [],
        characters: [],
      },
    }));
    localStorage.setItem(STORAGE_KEYS.SCENES('story-bad'), '{invalid json');

    const { useAppStore } = await import('../../../stores/use-app-store');
    await useAppStore.getState().migrateFromLegacyKeys();
    const state = useAppStore.getState();

    expect(state.storiesMetadata.map((story) => story.id)).toEqual(['story-good', 'story-bad']);
    expect(state.sceneRecordsByStory['story-good']?.['scene-good']).toBeTruthy();
    expect(state.sceneRecordHydration['story-good']).toBe('full');
    expect(state.sceneRecordsByStory['story-bad']).toBeUndefined();
    expect(state.migrationError).toContain('story-bad');
    expect(localStorage.getItem(STORAGE_KEYS.SCENES('story-good'))).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SCENES('story-bad'))).toBe('{invalid json');
    expect(localStorage.getItem(STORAGE_KEYS.STORIES)).not.toBeNull();
  });

  it('retires successful legacy inputs and never overwrites a current scene', async () => {
    const stories = [{
      id: 'story-1',
      title: 'Story',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
    }];
    const legacyScenes = {
      'scene-1': {
        id: 'scene-1',
        storyId: 'story-1',
        name: 'Legacy scene',
        text: 'Old text',
        choices: [],
        characters: [],
      },
    };
    localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
    localStorage.setItem(STORAGE_KEYS.SCENES('story-1'), JSON.stringify(legacyScenes));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ textSpeed: 0.2 }));

    const { useAppStore } = await import('../../../stores/use-app-store');
    await useAppStore.getState().migrateFromLegacyKeys();
    const migrated = useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'];
    useAppStore.setState({
      sceneRecordsByStory: {
        ...useAppStore.getState().sceneRecordsByStory,
        'story-1': { 'scene-1': { ...migrated, name: 'User edit', updatedAt: 99 } },
      },
      settings: { ...useAppStore.getState().settings, textSpeed: 0.9 },
    });

    // Simulate stale legacy keys surviving an older app version.
    localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
    localStorage.setItem(STORAGE_KEYS.SCENES('story-1'), JSON.stringify(legacyScenes));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ textSpeed: 0.1 }));
    await useAppStore.getState().migrateFromLegacyKeys();

    expect(useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'].name).toBe('User edit');
    expect(useAppStore.getState().settings.textSpeed).toBe(0.9);
    expect(localStorage.getItem(STORAGE_KEYS.STORIES)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SCENES('story-1'))).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SETTINGS)).toBeNull();
  });
});
