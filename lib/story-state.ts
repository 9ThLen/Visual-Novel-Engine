import { buildCompatibilitySceneMapFromState, type CanonicalSceneStateSnapshot } from '@/lib/canonical-scene';
import type { Story } from '@/lib/types';
import demoStory from '@/assets/demo-story.json';
import type { StoryMetadata } from '@/lib/story-domain';

const demoId = (demoStory as unknown as Record<string, unknown>).id as string;

export interface StoryStateSnapshot extends CanonicalSceneStateSnapshot {
  storiesMetadata: StoryMetadata[];
}

export function buildStoryFromStateSnapshot(
  snapshot: StoryStateSnapshot,
  storyId: string
): Story | null {
  const metadata = snapshot.storiesMetadata.find((item) => item.id === storyId);
  if (!metadata) {
    return null;
  }

  if (storyId === demoId) {
    return { ...(demoStory as unknown as Story) };
  }

  const { sceneCount, ...rest } = metadata;
  return {
    ...rest,
    scenes: buildCompatibilitySceneMapFromState(snapshot, storyId),
  };
}

export function buildStoriesFromStateSnapshot(snapshot: StoryStateSnapshot): Story[] {
  return snapshot.storiesMetadata
    .map((metadata) => buildStoryFromStateSnapshot(snapshot, metadata.id))
    .filter((story): story is Story => story !== null);
}
