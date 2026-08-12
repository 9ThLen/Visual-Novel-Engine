import type { SceneRecord } from '@/lib/engine/types';
import { persistSceneRecordsByStory, type SceneRecordStorageLike } from '@/lib/scene-record-storage';
import { writeStoryArchive } from '@/lib/story-backup/archive';
import { sha256Chunks, sourceFromBytes } from '@/lib/story-backup/hash';
import {
  importStoryArchive,
  type StoryArchiveImportDependencies,
} from '@/lib/story-backup/import';
import type {
  StoryArchiveBinarySink,
  StoryArchivePayloadV1,
} from '@/lib/story-backup/types';
import type { StoryMetadata } from '@/lib/story-domain';
import {
  persistAppStoreStateNow,
  useAppStore,
} from '@/stores/use-app-store';
import { resetAppStoreState } from '../../../__mocks__/stores/use-app-store';

const staging = vi.hoisted(() => ({
  discarded: vi.fn(),
  rolledBack: vi.fn(),
}));

const importDependencies: StoryArchiveImportDependencies = {
  createStagingSink: async (_importId, asset) => {
    const chunks: Uint8Array[] = [];
    return {
      write: async (chunk: Uint8Array) => { chunks.push(chunk.slice()); },
      close: async () => ({
        sha256: asset.sha256,
        stagedUri: `staged://${asset.sha256}`,
        mimeType: asset.mimeType,
        originalExtension: asset.originalExtension,
      }),
      abort: async () => { chunks.length = 0; },
    };
  },
  discardStaging: async (objects) => { staging.discarded(objects); },
  promote: async (objects) => new Map(
    Array.from(objects, (object) => [object.sha256, {
      sha256: object.sha256,
      uri: `idb://media/${object.sha256}`,
      created: true,
    }] as const),
  ),
  rollbackPromoted: async (objects) => { staging.rolledBack(objects); },
};

class MemoryArchiveSink implements StoryArchiveBinarySink {
  readonly chunks: Uint8Array[] = [];
  async write(chunk: Uint8Array): Promise<void> { this.chunks.push(chunk.slice()); }
  async close(): Promise<void> {}
  async abort(): Promise<void> { this.chunks.length = 0; }
  bytes(): Uint8Array {
    const result = new Uint8Array(this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let offset = 0;
    this.chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return result;
  }
}

function makeScene(storyId: string, assetReference?: string, voiceUri?: string): SceneRecord {
  return {
    id: 'scene-1',
    storyId,
    name: 'Scene',
    description: '',
    tags: [],
    timeline: assetReference ? [{
      id: 'background',
      blockType: 'background',
      collapsed: false,
      enabled: true,
      data: { assetId: assetReference, transition: 'fade', duration: 500 },
    }] : [],
    sceneState: {
      backgroundAssetId: assetReference ?? null,
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      soundEvents: assetReference ? [{
        id: 'state-sound',
        assetId: assetReference,
        mode: 'track',
        volume: 1,
        loop: false,
        fadeIn: 0,
        fadeOut: 0,
        pitchVariation: 0,
        timestamp: 1,
      }] : [],
      interactiveObjects: voiceUri ? [{
        id: 'state-object',
        imageUri: voiceUri,
        actions: [
          { type: 'play_audio', audioUri: voiceUri },
          { type: 'show_image', imageUri: voiceUri },
        ],
      }] : [],
      musicTrackId: assetReference ?? null,
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
    voiceAudioUri: voiceUri,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('importStoryArchive', () => {
  beforeEach(() => {
    resetAppStoreState();
    staging.discarded.mockReset();
    staging.rolledBack.mockReset();
  });

  it('creates a new story, remaps asset IDs/URIs and preserves existing stories', async () => {
    let persistCalls = 0;
    (persistAppStoreStateNow as unknown as { mockImplementation: (implementation: () => Promise<void>) => void })
      .mockImplementation(async () => { persistCalls += 1; });
    const existingStory: StoryMetadata = {
      id: 'existing-story',
      title: 'Existing',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
    };
    const archivedStory: StoryMetadata = {
      id: 'archived-story',
      title: 'Imported',
      tags: [
        '  first  ',
        'FIRST',
        ...Array.from({ length: 25 }, (_, index) => `tag-${index}`),
      ],
      theme: { dialogueBg: 'not-a-color' } as never,
      startSceneId: 'scene-1',
      createdAt: 2,
      updatedAt: 2,
      sceneCount: 1,
    };
    const oldUri = 'file:///old/background.flac';
    const objectBytes = new Uint8Array([4, 3, 2, 1]);
    const digest = await sha256Chunks(sourceFromBytes(objectBytes).open());
    const payload: StoryArchivePayloadV1 = {
      scenes: { 'scene-1': makeScene(archivedStory.id, 'old-asset', oldUri) },
      characters: [],
      audioLibrary: [],
      mediaMembershipIds: ['old-asset'],
    };
    const archiveSink = new MemoryArchiveSink();
    await writeStoryArchive({
      story: archivedStory,
      payload,
      appVersion: '1.0.0',
      assets: [{
        metadata: {
          assetId: 'old-asset',
          sourceReferences: ['old-asset', oldUri],
          sha256: digest.sha256,
          size: digest.size,
          kind: 'audio',
          mimeType: 'audio/flac',
          originalName: 'background.flac',
          originalExtension: '.flac',
          archivePath: `objects/${digest.sha256}`,
        },
        source: sourceFromBytes(objectBytes),
      }],
    }, archiveSink);

    const storageValues = new Map<string, string>();
    const storage: SceneRecordStorageLike = {
      getItem: async (key) => storageValues.get(key) ?? null,
      setItem: async (key, value) => { storageValues.set(key, value); },
      removeItem: async (key) => { storageValues.delete(key); },
    };
    const existingScene = makeScene(existingStory.id);
    await persistSceneRecordsByStory(storage, [existingStory], {
      [existingStory.id]: { 'scene-1': existingScene },
    });
    useAppStore.setState({
      storiesMetadata: [existingStory],
      sceneRecordsByStory: { [existingStory.id]: { 'scene-1': existingScene } },
      sceneRecordHydration: { [existingStory.id]: 'full' },
      characterLibraries: {},
      audioLibraries: {},
      imageAssetIdsByStory: {},
      mediaAssetIdsByStory: {},
      mediaLibrary: [],
      currentStoryId: existingStory.id,
      playbackState: null,
    });

    const result = await importStoryArchive(
      sourceFromBytes(archiveSink.bytes(), 9),
      storage,
      importDependencies,
    );
    const state = useAppStore.getState();
    expect(result.storyId).not.toBe(archivedStory.id);
    expect(state.storiesMetadata.map((story: StoryMetadata) => story.title)).toEqual(['Existing', 'Imported']);
    const importedStory = state.storiesMetadata.find((story: StoryMetadata) => story.id === result.storyId)!;
    expect(importedStory.tags).toHaveLength(20);
    expect(importedStory.tags?.[0]).toBe('first');
    expect(importedStory.theme).toBeUndefined();
    expect(state.sceneRecordsByStory[existingStory.id]['scene-1']).toEqual(existingScene);
    expect(state.sceneRecordHydration[result.storyId]).toBe('full');
    const importedAsset = state.mediaLibrary[0];
    expect(importedAsset.id).not.toBe('old-asset');
    expect(importedAsset.uri).toBe(`idb://media/${digest.sha256}`);
    expect(state.sceneRecordsByStory[result.storyId]['scene-1']).toMatchObject({
      storyId: result.storyId,
      voiceAudioUri: `idb://media/${digest.sha256}`,
      timeline: [{ data: { assetId: importedAsset.id } }],
      sceneState: {
        backgroundAssetId: importedAsset.id,
        musicTrackId: importedAsset.id,
        soundEvents: [{ assetId: importedAsset.id }],
        interactiveObjects: [{
          imageUri: `idb://media/${digest.sha256}`,
          actions: [
            { audioUri: `idb://media/${digest.sha256}` },
            { imageUri: `idb://media/${digest.sha256}` },
          ],
        }],
      },
    });
    expect(state.mediaAssetIdsByStory[result.storyId]).toEqual([importedAsset.id]);
    expect(persistCalls).toBe(1);
    expect(staging.rolledBack).not.toHaveBeenCalled();
  });

  it('restores app state and removes promoted objects when persistence fails', async () => {
    let persistCalls = 0;
    (persistAppStoreStateNow as unknown as { mockImplementation: (implementation: () => Promise<void>) => void })
      .mockImplementation(async () => {
        persistCalls += 1;
        if (persistCalls === 1) throw new Error('persist failed');
      });
    const existingStory: StoryMetadata = {
      id: 'existing-story',
      title: 'Existing',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
    };
    const archivedStory: StoryMetadata = {
      id: 'archived-story',
      title: 'Imported',
      startSceneId: 'scene-1',
      createdAt: 2,
      updatedAt: 2,
      sceneCount: 1,
    };
    const objectBytes = new Uint8Array([4, 3, 2, 1]);
    const digest = await sha256Chunks(sourceFromBytes(objectBytes).open());
    const archiveSink = new MemoryArchiveSink();
    await writeStoryArchive({
      story: archivedStory,
      payload: {
        scenes: { 'scene-1': makeScene(archivedStory.id, 'old-asset') },
        characters: [],
        audioLibrary: [],
        mediaMembershipIds: ['old-asset'],
      },
      appVersion: '1.0.0',
      assets: [{
        metadata: {
          assetId: 'old-asset',
          sourceReferences: ['old-asset'],
          sha256: digest.sha256,
          size: digest.size,
          kind: 'audio',
          mimeType: 'audio/flac',
          originalName: 'background.flac',
          originalExtension: '.flac',
          archivePath: `objects/${digest.sha256}`,
        },
        source: sourceFromBytes(objectBytes),
      }],
    }, archiveSink);

    const existingScene = makeScene(existingStory.id);
    const previousState = {
      storiesMetadata: [existingStory],
      sceneRecordsByStory: { [existingStory.id]: { 'scene-1': existingScene } },
      sceneRecordHydration: { [existingStory.id]: 'full' as const },
      characterLibraries: {},
      audioLibraries: {},
      imageAssetIdsByStory: {},
      mediaAssetIdsByStory: {},
      mediaLibrary: [],
      currentStoryId: existingStory.id,
      playbackState: null,
    };
    useAppStore.setState(previousState);
    const storage: SceneRecordStorageLike = {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };

    await expect(importStoryArchive(
      sourceFromBytes(archiveSink.bytes(), 9),
      storage,
      importDependencies,
    )).rejects.toThrow('persist failed');

    expect(persistCalls).toBe(2);
    expect(useAppStore.getState()).toMatchObject(previousState);
    expect(staging.rolledBack).toHaveBeenCalledOnce();
    expect(staging.discarded).toHaveBeenCalledOnce();
  });
});
