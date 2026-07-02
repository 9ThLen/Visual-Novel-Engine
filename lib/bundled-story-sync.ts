import type { Story } from '@/lib/scene-operations';
import type { AudioScene } from '@/lib/audio-types';
import { getAudioSceneMusicUri } from '@/lib/audio-scene';
import type { TimelineStep } from '@/lib/engine/types';

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
  sceneRecordsByStory: Record<string, Record<string, BundledAudioScene>>;
}

const READER_YIELDING_BLOCK_TYPES = new Set(['text', 'dialogue', 'choice', 'transition']);

function hasReaderYieldingStep(timeline: TimelineStep[] | undefined): boolean {
  return Array.isArray(timeline) && timeline.some((step) =>
    step.enabled !== false && READER_YIELDING_BLOCK_TYPES.has(step.blockType)
  );
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

  if (!hasReaderYieldingStep(canonicalRecord.timeline)) {
    return true;
  }

  const bundledMusicUri = bundledStartScene.musicUri ?? null;
  const currentMusicUri = getAudioSceneMusicUri(canonicalRecord);

  return bundledMusicUri !== currentMusicUri;
}
