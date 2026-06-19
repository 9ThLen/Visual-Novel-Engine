import type {
  ChoiceOption,
  DialogueBlockData,
  InteractiveObjectBlockData,
  TextBlockData,
  TimelineStep,
} from '@/lib/engine/types';
import type { SceneImageState } from '@/hooks/useSceneImages';
import type { InteractiveObject } from '@/lib/interactive-types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { PlaybackState } from '@/lib/engine/types';
import type { SaveSlot } from '@/lib/story-domain';
import { toSaveSlotMeta, type ReaderScene } from '@/lib/reader-scene';

export interface ReaderChoice {
  id: string;
  text: string;
  nextSceneId: string;
  targetSceneId: string | null;
  index: number;
}

export function getStartSceneId(
  sceneRecords: Record<string, ReaderScene>,
  metadataStartSceneId?: string | null,
): string | null {
  if (metadataStartSceneId && sceneRecords[metadataStartSceneId]) {
    return metadataStartSceneId;
  }
  return Object.values(sceneRecords).find((scene) => scene.isStart)?.id ?? null;
}

export function getNextSceneId(
  sceneRecords: Record<string, ReaderScene>,
  currentSceneId: string,
  explicitTargetSceneId?: string | null,
): string | null {
  if (explicitTargetSceneId) {
    return sceneRecords[explicitTargetSceneId] ? explicitTargetSceneId : null;
  }

  const currentScene = sceneRecords[currentSceneId];
  const nextConnection = currentScene?.connections?.find((connection) => connection.outputPort === 'next');
  return nextConnection && sceneRecords[nextConnection.targetSceneId]
    ? nextConnection.targetSceneId
    : null;
}

export function getTimelineDisplayPages(step: TimelineStep | undefined): string[] {
  if (!step) return [''];

  if (step.blockType === 'text') {
    const data = step.data as TextBlockData;
    return data.content.split('\n\n').filter(Boolean);
  }

  if (step.blockType === 'dialogue') {
    const data = step.data as DialogueBlockData;
    return data.entries
      .map((entry) => entry.characterId ? `${entry.characterId}: ${entry.text}` : entry.text)
      .filter(Boolean);
  }

  return [''];
}

export function toReaderChoices(options: ChoiceOption[] | null | undefined): ReaderChoice[] {
  return (options ?? []).map((option, index) => ({
    id: option.id,
    text: option.text,
    nextSceneId: option.targetSceneId ?? '',
    targetSceneId: option.targetSceneId,
    index,
  }));
}

export function createExecutorSceneImageState(
  sceneId: string,
  backgroundImageUri: string | null | undefined,
  characters: { characterId: string; spriteId?: string | null; position?: string }[],
): SceneImageState {
  return {
    id: sceneId,
    backgroundImageUri,
    characters: characters.map((character) => ({
      id: character.characterId,
      name: character.characterId,
      uri: character.spriteId || character.characterId,
    })),
  };
}

export function getTimelineInteractiveObjects(timeline: TimelineStep[] | null | undefined): InteractiveObject[] {
  return (timeline ?? [])
    .filter((step) => step.enabled && step.blockType === 'interactive_object')
    .map((step) => {
      const data = step.data as InteractiveObjectBlockData;
      return {
        id: data.objectId || step.id,
        name: data.name,
        imageUri: data.assetId ?? undefined,
        position: data.position,
        actions: data.actions,
        oneTimeOnly: data.oneTimeOnly,
        pulseAnimation: data.pulseAnimation,
        highlightOnHover: true,
        isActive: true,
      };
    });
}

export interface ReaderRuntimeSnapshot {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, ReaderScene>>;
}

export function buildCanonicalSaveSlot(
  slotId: string,
  snapshot: ReaderRuntimeSnapshot,
  playbackState: PlaybackState,
): SaveSlot | null {
  const metadata = snapshot.storiesMetadata.find((story) => story.id === playbackState.storyId);
  const scene = snapshot.sceneRecordsByStory[playbackState.storyId]?.[playbackState.currentSceneId];
  if (!metadata || !scene) return null;
  const sceneMeta = toSaveSlotMeta(scene);

  return {
    id: slotId,
    storyId: playbackState.storyId,
    sceneId: playbackState.currentSceneId,
    choicesMade: playbackState.choicesMade,
    timestamp: Date.now(),
    sceneName: sceneMeta.sceneName,
    thumbnailUri: sceneMeta.thumbnailUri,
    storyTitle: metadata.title,
    sceneText: sceneMeta.sceneText,
    playTime: 0,
  };
}

export function buildCanonicalLoadSnapshot(
  snapshot: ReaderRuntimeSnapshot,
  slot: SaveSlot,
): { storyId: string; playbackState: PlaybackState } | null {
  const metadata = snapshot.storiesMetadata.find((story) => story.id === slot.storyId);
  const scene = snapshot.sceneRecordsByStory[slot.storyId]?.[slot.sceneId];
  if (!metadata || !scene) return null;

  return {
    storyId: slot.storyId,
    playbackState: {
      storyId: slot.storyId,
      currentSceneId: slot.sceneId,
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: slot.choicesMade,
    },
  };
}
