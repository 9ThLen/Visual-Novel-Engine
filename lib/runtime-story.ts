import demoStory from '@/assets/demo-story.json';
import type { CanonicalSceneStateSnapshot } from '@/lib/canonical-scene';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
/** @deprecated Use direct TimelineStep[] access via useSceneExecutor */
import { sceneRecordToStoryScene } from '@/lib/scene-record-adapter';
import { StoryDomain } from '@/lib/story-domain';
import type { PlaybackState, SaveSlot, Story, StoryScene } from '@/lib/types';
import type { StoryMetadata } from '@/lib/story-domain';

const demoId = (demoStory as unknown as Record<string, unknown>).id as string;

export interface RuntimeSceneStateSnapshot extends CanonicalSceneStateSnapshot {}

export interface RuntimeStoryStateSnapshot extends RuntimeSceneStateSnapshot {
  storiesMetadata: StoryMetadata[];
}

export interface RuntimeSceneSnapshot {
  source: 'canonical' | 'legacy';
  scene: StoryScene;
  timeline: TimelineStep[];
  sceneRecord?: SceneRecord;
}

export interface PreviewTimelineResolution {
  source: 'draft' | 'canonical' | 'legacy' | 'missing';
  timeline: TimelineStep[];
}

export interface RuntimeLoadSnapshot {
  story: Story;
  playbackState: PlaybackState;
}

function isTimelineStepArray(value: unknown): value is TimelineStep[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    return 'id' in item && 'blockType' in item && 'data' in item;
  });
}

function getLegacyRuntimeTimeline(scene: StoryScene): TimelineStep[] {
  return isTimelineStepArray(scene.blocks) ? scene.blocks : [];
}

export function buildRuntimeSceneSnapshot(
  snapshot: RuntimeSceneStateSnapshot,
  storyId: string,
  sceneId: string
): RuntimeSceneSnapshot | null {
  const sceneRecord = snapshot.sceneRecordsByStory[storyId]?.[sceneId];
  if (sceneRecord) {
    return {
      source: 'canonical',
      scene: sceneRecordToStoryScene(sceneRecord),
      timeline: sceneRecord.timeline,
      sceneRecord,
    };
  }

  return null;
}

export function buildCompatibilityRuntimeSceneSnapshot(
  snapshot: RuntimeSceneStateSnapshot,
  storyId: string,
  sceneId: string
): RuntimeSceneSnapshot | null {
  const canonicalSnapshot = buildRuntimeSceneSnapshot(snapshot, storyId, sceneId);
  if (canonicalSnapshot) {
    return canonicalSnapshot;
  }

  const legacyScene = snapshot.scenesByStory[storyId]?.[sceneId];
  if (!legacyScene) {
    return null;
  }

  return {
    source: 'legacy',
    scene: legacyScene,
    timeline: getLegacyRuntimeTimeline(legacyScene),
  };
}

function getRuntimeSceneIds(snapshot: RuntimeStoryStateSnapshot, storyId: string): string[] {
  return Object.keys(snapshot.sceneRecordsByStory[storyId] || {});
}

export function buildRuntimeStorySnapshot(
  snapshot: RuntimeStoryStateSnapshot,
  storyId: string
): Story | null {
  const metadata = snapshot.storiesMetadata.find((item) => item.id === storyId);
  if (!metadata) {
    return null;
  }

  if (storyId === demoId) {
    return { ...(demoStory as unknown as Story) };
  }

  const scenes = getRuntimeSceneIds(snapshot, storyId).reduce<Record<string, StoryScene>>((acc, sceneId) => {
    const runtimeScene = buildRuntimeSceneSnapshot(snapshot, storyId, sceneId);
    if (runtimeScene) {
      acc[sceneId] = runtimeScene.scene;
    }
    return acc;
  }, {});

  const { sceneCount, ...rest } = metadata;
  return {
    ...rest,
    scenes,
  };
}

export function buildRuntimeStoriesSnapshot(snapshot: RuntimeStoryStateSnapshot): Story[] {
  return snapshot.storiesMetadata
    .map((metadata) => buildRuntimeStorySnapshot(snapshot, metadata.id))
    .filter((story): story is Story => story !== null);
}

export function buildRuntimeSaveSlot(
  slotId: string,
  snapshot: RuntimeStoryStateSnapshot,
  playbackState: PlaybackState
): SaveSlot | null {
  const story = buildRuntimeStorySnapshot(snapshot, playbackState.storyId);
  if (!story) {
    return null;
  }

  const runtimeScene = buildRuntimeSceneSnapshot(
    snapshot,
    playbackState.storyId,
    playbackState.currentSceneId
  );
  if (!runtimeScene) {
    return null;
  }

  return StoryDomain.createSaveSlot(slotId, story, playbackState, runtimeScene.scene);
}

export function buildRuntimeLoadSnapshot(
  snapshot: RuntimeStoryStateSnapshot,
  slot: SaveSlot
): RuntimeLoadSnapshot | null {
  const story = buildRuntimeStorySnapshot(snapshot, slot.storyId);
  if (!story) {
    return null;
  }

  const runtimeScene = buildRuntimeSceneSnapshot(snapshot, slot.storyId, slot.sceneId);
  if (!runtimeScene) {
    return null;
  }

  return {
    story,
    playbackState: {
      storyId: slot.storyId,
      currentSceneId: slot.sceneId,
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: slot.choicesMade,
    },
  };
}

export function resolveRuntimeCurrentScene(
  snapshot: RuntimeSceneStateSnapshot,
  playbackState: PlaybackState | null
): StoryScene | null {
  if (!playbackState) {
    return null;
  }

  return buildRuntimeSceneSnapshot(
    snapshot,
    playbackState.storyId,
    playbackState.currentSceneId
  )?.scene ?? null;
}

export function resolvePreviewTimeline(
  snapshot: RuntimeSceneStateSnapshot,
  options: {
    storyId: string;
    sceneId: string;
    draftTimeline?: TimelineStep[];
  }
): PreviewTimelineResolution {
  if (options.draftTimeline && options.draftTimeline.length > 0) {
    return {
      source: 'draft',
      timeline: options.draftTimeline,
    };
  }

  const runtimeScene = buildRuntimeSceneSnapshot(snapshot, options.storyId, options.sceneId);
  if (!runtimeScene) {
    return {
      source: 'missing',
      timeline: [],
    };
  }

  return {
    source: runtimeScene.source,
    timeline: runtimeScene.timeline,
  };
}
