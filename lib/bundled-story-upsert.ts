import type { Story } from '@/lib/scene-operations';
import type { SceneRecord } from '@/lib/engine/types';
import { migrateSceneRecordMap } from '@/lib/audio-block-migration';
import {
  buildCanonicalSceneRecordsFromLegacyScenes,
} from '@/lib/scene-operations';
import { StoryDomain, type StoryMetadata } from '@/lib/story-domain';

export interface BundledStorySyncPayload {
  metadata: StoryMetadata;
  sceneRecords: Record<string, SceneRecord>;
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
