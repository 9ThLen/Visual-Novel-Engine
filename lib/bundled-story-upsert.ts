import type { Story } from '@/lib/scene-operations';
import type { SceneRecord } from '@/lib/engine/types';
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
  return {
    metadata: StoryDomain.extractMetadata(bundledStory),
    sceneRecords: buildCanonicalSceneRecordsFromLegacyScenes(
      bundledStory.id,
      bundledStory.scenes || {},
      bundledStory.startSceneId,
    ),
  };
}
