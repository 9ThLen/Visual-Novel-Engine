import type { Story } from '@/lib/scene-operations';
import type { CanonicalStory, StoryMetadata } from '@/lib/story-domain';
import { useAppStore } from '@/stores/use-app-store';
import type { SceneRecord } from '@/lib/engine/types';
import { migrateSceneRecordMap } from '@/lib/audio-block-migration';
import {
  buildCanonicalSceneRecordsFromLegacyScenes,
} from '@/lib/scene-operations';
import { StoryDomain } from '@/lib/story-domain';

export interface BundledStorySyncPayload {
  metadata: StoryMetadata;
  sceneRecords: Record<string, SceneRecord>;
}

export function upsertBundledStory(metadata: StoryMetadata, sceneRecords: Record<string, SceneRecord>, characterLibrary?: CanonicalStory['characterLibrary']): void {
  useAppStore.setState((state) => ({
    storiesMetadata: state.storiesMetadata.some((item) => item.id === metadata.id)
      ? state.storiesMetadata.map((item) => item.id === metadata.id ? metadata : item)
      : [...state.storiesMetadata, metadata],
    sceneRecordsByStory: { ...state.sceneRecordsByStory, [metadata.id]: sceneRecords },
    sceneRecordHydration: { ...state.sceneRecordHydration, [metadata.id]: 'full' },
    characterLibraries: characterLibrary?.length ? { ...state.characterLibraries, [metadata.id]: characterLibrary } : state.characterLibraries,
  }));
}

export function createBundledStorySyncPayload(
  bundledStory: Story,
): BundledStorySyncPayload {
  const sceneRecords = buildCanonicalSceneRecordsFromLegacyScenes(
    bundledStory.id,
    bundledStory.scenes || {},
    bundledStory.startSceneId,
  );

  return {
    metadata: StoryDomain.extractMetadata(bundledStory),
    sceneRecords: migrateSceneRecordMap(sceneRecords),
  };
}
