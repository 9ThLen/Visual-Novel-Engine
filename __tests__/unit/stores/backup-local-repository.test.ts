import {
  BACKUP_SCHEMA_VERSION,
  validateBackupManifest,
  type BackupManifest,
} from '@/lib/backup-service';
import type { SceneRecord } from '@/lib/engine/types';
import {
  buildSceneRecordStorageEntries,
  type SceneRecordStorageLike,
} from '@/lib/scene-record-storage';
import type { StoryMetadata } from '@/lib/story-domain';
import { createAppLocalRepository } from '@/stores/backup-local-repository';
import { resetAppStoreState, useAppStore } from '../../../__mocks__/stores/use-app-store';

const STORY: StoryMetadata = {
  id: 'story-1',
  title: 'Story',
  startSceneId: 'scene-1',
  createdAt: 1,
  updatedAt: 1,
  sceneCount: 4,
};

function scene(id: string, storyId = 'story-1'): SceneRecord {
  return {
    id,
    storyId,
    name: id,
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
    isStart: id === 'scene-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

const STORED_SCENES = {
  'scene-1': scene('scene-1'),
  'scene-2': scene('scene-2'),
  'scene-3': scene('scene-3'),
  'scene-4': scene('scene-4'),
};

/** Seeds the canonical per-story keys the way persistSceneRecordsByStory writes them. */
function createSceneStorage(): SceneRecordStorageLike {
  const values = new Map(
    buildSceneRecordStorageEntries({ 'story-1': STORED_SCENES }, 1)
      .map((entry) => [entry.key, JSON.stringify(entry.payload)] as const),
  );
  return {
    getItem: (key: string) => Promise.resolve(values.get(key) ?? null),
    setItem: (key: string, value: string) => { values.set(key, value); return Promise.resolve(); },
    removeItem: (key: string) => { values.delete(key); return Promise.resolve(); },
  };
}

describe('createAppLocalRepository', () => {
  beforeEach(() => {
    resetAppStoreState();
    useAppStore.setState({ storiesMetadata: [STORY] });
  });

  it('backs up every stored scene of a story the reader only windowed', async () => {
    // What hydrateReaderSceneWindow leaves behind: one scene, marked 'window'.
    useAppStore.setState({
      sceneRecordsByStory: { 'story-1': { 'scene-3': scene('scene-3') } },
      sceneRecordHydration: { 'story-1': 'window' },
    });

    const data = await createAppLocalRepository(createSceneStorage()).captureBackupData();

    expect(Object.keys(data.scenes['story-1']).sort()).toEqual([
      'scene-1', 'scene-2', 'scene-3', 'scene-4',
    ]);
  });

  it('backs up scenes of a story that was never opened this session', async () => {
    // A cold start: the persist envelope is compacted, so the store map is empty.
    const data = await createAppLocalRepository(createSceneStorage()).captureBackupData();

    expect(Object.keys(data.scenes['story-1'])).toHaveLength(4);
  });

  it('trusts memory over storage once a story is fully hydrated', async () => {
    // 'full' means the store holds the whole map, so a deletion must not resurrect.
    useAppStore.setState({
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene('scene-1') } },
      sceneRecordHydration: { 'story-1': 'full' },
    });

    const data = await createAppLocalRepository(createSceneStorage()).captureBackupData();

    expect(Object.keys(data.scenes['story-1'])).toEqual(['scene-1']);
  });

  it('carries bundled media without demanding bytes for it', async () => {
    useAppStore.setState({
      mediaLibrary: [{ id: 'bundled', type: 'image', uri: 'assets/bg.png', name: 'bg.png', addedAt: 1 }],
    });
    const repository = createAppLocalRepository(createSceneStorage());

    // The bytes live in the app bundle, so there is nothing to upload...
    await expect(repository.listBackupAssets()).resolves.toEqual([]);
    // ...but the library entry itself must still survive the round trip.
    const data = await repository.captureBackupData();
    expect(data.libraries.media).toHaveLength(1);
  });

  it('produces a manifest the validator accepts', async () => {
    // The manifest invariants are only worth anything if what the repository
    // actually captures satisfies them — the service tests mock this away.
    useAppStore.setState({
      mediaLibrary: [{ id: 'bundled', type: 'image', uri: 'assets/bg.png', name: 'bg.png', addedAt: 1 }],
      sceneRecordsByStory: { 'story-1': { 'scene-3': scene('scene-3') } },
      sceneRecordHydration: { 'story-1': 'window' },
    });
    const repository = createAppLocalRepository(createSceneStorage());

    const manifest: BackupManifest = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      backupId: 'backup-1',
      createdAt: new Date(1).toISOString(),
      appVersion: '1.0.0',
      ...await repository.captureBackupData(),
      assets: [],
    };

    expect(() => validateBackupManifest(manifest)).not.toThrow();
    expect(Object.keys(manifest.scenes['story-1'])).toHaveLength(4);
  });
});
