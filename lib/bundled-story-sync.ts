import type { Story } from '@/lib/types';
import type { SceneRecord } from '@/lib/engine/types';
import { sceneRecordToStoryScene } from '@/lib/scene-record-adapter';

export interface BundledStorySyncSnapshot {
  storiesMetadata: Array<{ id: string }>;
  scenesByStory: Record<string, Record<string, { musicUri?: string | null }>>;
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
}

export function shouldUpsertBundledStory(
  snapshot: BundledStorySyncSnapshot,
  bundledStory: Story,
): boolean {
  const storyId = bundledStory.id;
  const startSceneId = bundledStory.startSceneId;

  if (!snapshot.storiesMetadata.some((story) => story.id === storyId)) {
    return true;
  }

  const bundledStartScene = bundledStory.scenes?.[startSceneId];
  if (!bundledStartScene) {
    return false;
  }

  const canonicalRecord = snapshot.sceneRecordsByStory[storyId]?.[startSceneId];
  if (!canonicalRecord) {
    return true;
  }

  const currentCanonicalScene = sceneRecordToStoryScene(canonicalRecord);
  const currentLegacyScene = snapshot.scenesByStory[storyId]?.[startSceneId];

  const bundledMusicUri = bundledStartScene.musicUri ?? null;
  const currentMusicUri = currentCanonicalScene.musicUri ?? currentLegacyScene?.musicUri ?? null;

  return bundledMusicUri !== currentMusicUri;
}
