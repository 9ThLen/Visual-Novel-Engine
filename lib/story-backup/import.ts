import { Platform } from 'react-native';

import type { Character } from '@/lib/character-types';
import type {
  BackgroundBlockData,
  InteractiveObjectBlockData,
  MusicBlockData,
  SceneRecord,
  SoundBlockData,
  TimelineStep,
} from '@/lib/engine/types';
import { generateAssetId, generateId, generateStoryId } from '@/lib/id-utils';
import type { LibraryAsset } from '@/lib/media-library-service';
import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  loadSceneRecordsForStory,
  type SceneRecordStorageLike,
} from '@/lib/scene-record-storage';
import {
  extractStoryArchive,
  type StoryArchiveObjectSink,
} from '@/lib/story-backup/extract';
import { readStoryArchiveManifest } from '@/lib/story-backup/archive';
import {
  createStoryBackupStagingSink,
  discardStagedStoryBackupObjects,
  promoteStagedStoryBackupObjects,
  rollbackPromotedStoryBackupObjects,
  type StagedStoryBackupObject,
  type PromotedStoryBackupObject,
} from '@/lib/story-backup/staging';
import {
  STORY_BACKUP_LIMITS,
  type StoryArchiveBinarySource,
  type StoryArchiveManifestV1,
  type StoryArchivePayloadV1,
  type StoryBackupAsset,
} from '@/lib/story-backup/types';
import { normalizeStoryMetadata, type StoryMetadata } from '@/lib/story-domain';
import { persistAppStoreStateNow, useAppStore } from '@/stores/use-app-store';

export interface ImportStoryArchiveResult {
  storyId: string;
  manifest: StoryArchiveManifestV1;
}

export interface StoryArchiveImportDependencies {
  createStagingSink: (
    importId: string,
    asset: StoryBackupAsset,
  ) => Promise<StoryArchiveObjectSink<StagedStoryBackupObject>>;
  promote: (
    objects: Iterable<StagedStoryBackupObject>,
  ) => Promise<Map<string, PromotedStoryBackupObject>>;
  discardStaging: (objects: Iterable<StagedStoryBackupObject>) => Promise<void>;
  rollbackPromoted: (objects: Iterable<PromotedStoryBackupObject>) => Promise<void>;
}

const defaultImportDependencies: StoryArchiveImportDependencies = {
  createStagingSink: createStoryBackupStagingSink,
  promote: promoteStagedStoryBackupObjects,
  discardStaging: discardStagedStoryBackupObjects,
  rollbackPromoted: rollbackPromotedStoryBackupObjects,
};

function requirePayloadConsistency(
  manifest: StoryArchiveManifestV1,
  payload: StoryArchivePayloadV1,
): void {
  const scenes = Object.entries(payload.scenes);
  if (scenes.length !== manifest.counts.scenes
    || payload.characters.length !== manifest.counts.characters
    || payload.audioLibrary.length !== manifest.counts.audioItems) {
    throw new Error('Story backup payload counts do not match manifest');
  }
  for (const [sceneId, scene] of scenes) {
    if (!scene || scene.id !== sceneId || scene.storyId !== manifest.story.id) {
      throw new Error(`Invalid story backup scene: ${sceneId}`);
    }
  }
  if (!payload.scenes[manifest.story.startSceneId]) {
    throw new Error('Story backup start scene is missing');
  }
  const audioIds = new Set(payload.audioLibrary.map((item) => item.id));
  for (const scene of Object.values(payload.scenes)) {
    for (const trigger of scene.audioTriggers ?? []) {
      if (!audioIds.has(trigger.audioId)) {
        throw new Error(`Story backup audio trigger is missing its library item: ${trigger.audioId}`);
      }
    }
  }
}

function createUniqueId(factory: () => string, used: Set<string>): string {
  let id = factory();
  while (used.has(id)) id = factory();
  used.add(id);
  return id;
}

function remapTimeline(
  timeline: TimelineStep[],
  assetIdByReference: Map<string, string>,
  uriByReference: Map<string, string>,
): TimelineStep[] {
  const remapAsset = (value: string | null | undefined) =>
    value ? assetIdByReference.get(value) ?? value : value;
  const remapUri = (value: string | null | undefined) =>
    value ? uriByReference.get(value) ?? value : value;
  const remapActions = (actions: InteractiveObjectBlockData['actions']) => actions.map((action) => {
    if (action.type === 'play_audio') return { ...action, audioUri: remapUri(action.audioUri) ?? '' };
    if (action.type === 'show_image') return { ...action, imageUri: remapUri(action.imageUri) ?? '' };
    return action;
  });

  return timeline.map((step) => {
    const next = structuredClone(step);
    if (next.blockType === 'background') {
      const data = next.data as BackgroundBlockData;
      data.assetId = remapAsset(data.assetId) ?? null;
    } else if (next.blockType === 'music') {
      const data = next.data as MusicBlockData;
      data.assetId = remapAsset(data.assetId) ?? null;
    } else if (next.blockType === 'sound') {
      const data = next.data as SoundBlockData;
      data.assetId = remapAsset(data.assetId) ?? null;
    } else if (next.blockType === 'interactive_object') {
      const data = next.data as InteractiveObjectBlockData;
      data.assetId = remapAsset(data.assetId) ?? null;
      data.actions = remapActions(data.actions);
    }
    return next;
  });
}

function remapScenes(
  scenes: Record<string, SceneRecord>,
  storyId: string,
  assetIdByReference: Map<string, string>,
  uriByReference: Map<string, string>,
): Record<string, SceneRecord> {
  return Object.fromEntries(Object.entries(scenes).map(([sceneId, scene]) => {
    const next = structuredClone(scene);
    const remapAsset = (value: string | null | undefined) =>
      value ? assetIdByReference.get(value) ?? value : value;
    const remapUri = (value: string | null | undefined) =>
      value ? uriByReference.get(value) ?? value : value;
    next.storyId = storyId;
    next.voiceAudioUri = remapUri(next.voiceAudioUri);
    next.timeline = remapTimeline(next.timeline, assetIdByReference, uriByReference);
    next.sceneState.backgroundAssetId = remapAsset(next.sceneState.backgroundAssetId) ?? null;
    next.sceneState.musicTrackId = remapAsset(next.sceneState.musicTrackId) ?? null;
    next.sceneState.soundEvents = next.sceneState.soundEvents?.map((event) => ({
      ...event,
      assetId: remapAsset(event.assetId) ?? event.assetId,
    }));
    next.sceneState.interactiveObjects = next.sceneState.interactiveObjects?.map((object) => ({
      ...object,
      imageUri: remapUri(object.imageUri) ?? undefined,
      actions: object.actions.map((action) => {
        if (action.type === 'play_audio') return { ...action, audioUri: remapUri(action.audioUri) ?? '' };
        if (action.type === 'show_image') return { ...action, imageUri: remapUri(action.imageUri) ?? '' };
        return action;
      }),
    }));
    return [sceneId, next];
  }));
}

function remapCharacters(
  characters: Character[],
  uriByReference: Map<string, string>,
): Character[] {
  return characters.map((character) => ({
    ...structuredClone(character),
    sprites: character.sprites.map((sprite) => ({
      ...structuredClone(sprite),
      uri: uriByReference.get(sprite.uri) ?? uriByReference.get(sprite.assetUri ?? '') ?? sprite.uri,
      ...(sprite.assetUri
        ? { assetUri: uriByReference.get(sprite.assetUri) ?? uriByReference.get(sprite.uri) ?? sprite.assetUri }
        : {}),
    })),
  }));
}

async function loadCompleteExistingScenes(
  storage: SceneRecordStorageLike,
  stories: StoryMetadata[],
  scenesByStory: Record<string, Record<string, SceneRecord>>,
  hydrationByStory: Record<string, 'full' | 'window'>,
): Promise<Record<string, Record<string, SceneRecord>>> {
  return Object.fromEntries(await Promise.all(stories.map(async (story) => [
    story.id,
    hydrationByStory[story.id] === 'full'
      ? structuredClone(scenesByStory[story.id] ?? {})
      : await loadSceneRecordsForStory(storage, story.id),
  ] as const)));
}

export async function importStoryArchive(
  source: StoryArchiveBinarySource,
  storage: SceneRecordStorageLike = createPersistentStorage() as SceneRecordStorageLike,
  dependencies: StoryArchiveImportDependencies = defaultImportDependencies,
): Promise<ImportStoryArchiveResult> {
  const manifest = await readStoryArchiveManifest(source);
  const importId = generateId('story_import');
  const staged = await extractStoryArchive(
    source,
    manifest,
    (asset) => dependencies.createStagingSink(importId, asset),
    Platform.OS === 'web'
      ? STORY_BACKUP_LIMITS.maxWebUncompressedBytes
      : STORY_BACKUP_LIMITS.maxNativeUncompressedBytes,
  );
  const stagedObjects = Array.from(staged.objects.values());

  try {
    requirePayloadConsistency(manifest, staged.payload);
    const state = useAppStore.getState();
    const existingStoryIds = new Set(state.storiesMetadata.map((story) => story.id));
    const newStoryId = createUniqueId(generateStoryId, existingStoryIds);
    const usedAssetIds = new Set(state.mediaLibrary.map((asset) => asset.id));
    const assetIdByReference = new Map<string, string>();
    const uriByReference = new Map<string, string>();
    const newIdByArchiveId = new Map<string, string>();

    for (const asset of manifest.assets) {
      const newAssetId = createUniqueId(generateAssetId, usedAssetIds);
      newIdByArchiveId.set(asset.assetId, newAssetId);
      for (const reference of new Set([asset.assetId, ...asset.sourceReferences])) {
        const existing = assetIdByReference.get(reference);
        if (existing && existing !== newAssetId) {
          throw new Error(`Ambiguous story backup media reference: ${reference}`);
        }
        assetIdByReference.set(reference, newAssetId);
      }
    }
    for (const membershipId of staged.payload.mediaMembershipIds) {
      if (!assetIdByReference.has(membershipId)) {
        throw new Error(`Story backup membership references an unknown asset: ${membershipId}`);
      }
    }

    const promoted = await dependencies.promote(stagedObjects);
    try {
      for (const asset of manifest.assets) {
        const object = promoted.get(asset.sha256);
        if (!object) throw new Error(`Story backup object was not promoted: ${asset.sha256}`);
        for (const reference of new Set([asset.assetId, ...asset.sourceReferences])) {
          uriByReference.set(reference, object.uri);
        }
      }

      const importedAssets: LibraryAsset[] = manifest.assets.map((asset) => ({
        id: newIdByArchiveId.get(asset.assetId)!,
        type: asset.kind === 'image' || asset.kind === 'audio' ? asset.kind : 'other',
        uri: promoted.get(asset.sha256)!.uri,
        name: asset.originalName,
        mimeType: asset.mimeType,
        size: asset.size,
        contentHash: asset.sha256,
        addedAt: Date.now(),
      }));
      const remappedScenes = remapScenes(
        staged.payload.scenes,
        newStoryId,
        assetIdByReference,
        uriByReference,
      );
      const remappedCharacters = remapCharacters(staged.payload.characters, uriByReference);
      const remappedAudio = staged.payload.audioLibrary.map((item) => ({
        ...structuredClone(item),
        uri: uriByReference.get(item.uri) ?? item.uri,
      }));
      const importedMembership = staged.payload.mediaMembershipIds.map((assetId) =>
        assetIdByReference.get(assetId)!).filter(Boolean);
      const importedImageIds = importedAssets
        .filter((asset) => asset.type === 'image')
        .map((asset) => asset.id);
      const importedStory = normalizeStoryMetadata({
        ...structuredClone(manifest.story),
        id: newStoryId,
        sceneCount: Object.keys(remappedScenes).length,
        thumbnailUri: manifest.story.thumbnailUri
          ? uriByReference.get(manifest.story.thumbnailUri) ?? manifest.story.thumbnailUri
          : manifest.story.thumbnailUri,
      });

      const previous = structuredClone({
        storiesMetadata: state.storiesMetadata,
        sceneRecordsByStory: state.sceneRecordsByStory,
        sceneRecordHydration: state.sceneRecordHydration,
        characterLibraries: state.characterLibraries,
        audioLibraries: state.audioLibraries,
        imageAssetIdsByStory: state.imageAssetIdsByStory,
        mediaAssetIdsByStory: state.mediaAssetIdsByStory,
        mediaLibrary: state.mediaLibrary,
        currentStoryId: state.currentStoryId,
        playbackState: state.playbackState,
      });
      const completeExistingScenes = await loadCompleteExistingScenes(
        storage,
        state.storiesMetadata,
        state.sceneRecordsByStory,
        state.sceneRecordHydration,
      );
      const nextStories = [...state.storiesMetadata, importedStory];
      const completeNextScenes = { ...completeExistingScenes, [newStoryId]: remappedScenes };
      const nextHydration = Object.fromEntries(nextStories.map((story) => [story.id, 'full' as const]));
      const nextState = {
        storiesMetadata: nextStories,
        sceneRecordsByStory: completeNextScenes,
        sceneRecordHydration: nextHydration,
        characterLibraries: { ...state.characterLibraries, [newStoryId]: remappedCharacters },
        audioLibraries: { ...state.audioLibraries, [newStoryId]: remappedAudio },
        imageAssetIdsByStory: { ...state.imageAssetIdsByStory, [newStoryId]: importedImageIds },
        mediaAssetIdsByStory: { ...state.mediaAssetIdsByStory, [newStoryId]: importedMembership },
        mediaLibrary: [...state.mediaLibrary, ...importedAssets],
        currentStoryId: newStoryId,
        playbackState: null,
      };
      useAppStore.setState(nextState);

      try {
        await persistAppStoreStateNow();
        useAppStore.setState({
          sceneRecordsByStory: { ...previous.sceneRecordsByStory, [newStoryId]: remappedScenes },
          sceneRecordHydration: { ...previous.sceneRecordHydration, [newStoryId]: 'full' },
        });
      } catch (error) {
        useAppStore.setState({
          ...previous,
          sceneRecordsByStory: completeExistingScenes,
          sceneRecordHydration: Object.fromEntries(
            previous.storiesMetadata.map((story) => [story.id, 'full' as const]),
          ),
        });
        await persistAppStoreStateNow().catch(() => undefined);
        useAppStore.setState(previous);
        throw error;
      }

      return { storyId: newStoryId, manifest };
    } catch (error) {
      await dependencies.rollbackPromoted(promoted.values());
      throw error;
    }
  } finally {
    await dependencies.discardStaging(stagedObjects).catch(() => undefined);
  }
}
