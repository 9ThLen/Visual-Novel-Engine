import type { Story } from '@/lib/scene-operations';
import type { MusicBlockData, SceneRecord } from '@/lib/engine/types';

export interface BundledStorySyncSnapshot {
  storiesMetadata: { id: string }[];
  /** @deprecated Ignored. Kept so old tests/snapshots can pass extra state. */
  scenesByStory?: Record<string, unknown>;
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
}

function getSceneRecordMusicUri(sceneRecord: SceneRecord): string | null {
  const musicStep = sceneRecord.timeline.find((step) => step.enabled && step.blockType === 'music');
  if (!musicStep) return null;
  const data = musicStep.data as MusicBlockData;
  return data.action === 'play' ? data.assetId ?? null : null;
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

  const bundledMusicUri = bundledStartScene.musicUri ?? null;
  const currentMusicUri = getSceneRecordMusicUri(canonicalRecord);

  return bundledMusicUri !== currentMusicUri;
}
