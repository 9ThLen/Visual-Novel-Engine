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
    expect(localStorage.getItem(STORAGE_KEYS.SCENES('story-bad'))).toBe('{invalid json');
  });
});
