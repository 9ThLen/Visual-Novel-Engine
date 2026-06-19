import type { Story } from '@/lib/scene-operations';
import type { AudioScene } from '@/lib/audio-types';
import { getAudioSceneMusicUri } from '@/lib/audio-scene';

type BundledAudioScene = AudioScene & {
  description?: unknown;
  tags?: unknown;
  sceneState?: unknown;
  flowX?: unknown;
  flowY?: unknown;
  connections?: unknown;
  isStart?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export interface BundledStorySyncSnapshot {
  storiesMetadata: { id: string }[];
  /** @deprecated Ignored. Kept so old tests/snapshots can pass extra state. */
  scenesByStory?: Record<string, unknown>;
  sceneRecordsByStory: Record<string, Record<string, BundledAudioScene>>;
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
  const currentMusicUri = getAudioSceneMusicUri(canonicalRecord);

  return bundledMusicUri !== currentMusicUri;
}
