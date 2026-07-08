import type {
  ChoiceOption,
  DialogueBlockData,
  InteractiveObjectBlockData,
  TextBlockData,
  TimelineStep,
  TransitionMode,
  TransitionType,
} from '@/lib/engine/types';
import type { SceneImageState } from '@/hooks/useSceneImages';
import type { InteractiveObject } from '@/lib/interactive-types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { PlaybackState, RuntimeVariables } from '@/lib/engine/runtime-types';
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

/**
 * Details of a transition emitted by the executor, passed alongside the
 * target scene id so hosts can resolve the destination and animate the entry.
 */
export interface ReaderTransitionEvent {
  mode: TransitionMode;
  transitionType: TransitionType;
  durationSec: number;
}

/**
 * Resolve where a transition leads. Returns the next scene id, or null when
 * the story ends.
 *
 * - mode 'end'   → always null.
 * - mode 'scene' → the explicit target, or null when it doesn't exist.
 * - mode 'next'  → the scene's `next` connection, or null when there is none.
 */
export function getNextSceneId(
  sceneRecords: Record<string, ReaderScene>,
  currentSceneId: string,
  explicitTargetSceneId?: string | null,
  mode: TransitionMode = 'next',
): string | null {
  if (mode === 'end') return null;
  if (explicitTargetSceneId) {
    return sceneRecords[explicitTargetSceneId] ? explicitTargetSceneId : null;
  }
  if (mode === 'scene') return null;

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
      .map((entry) => {
        const speaker = entry.speakerName || entry.characterId;
        return speaker ? `${speaker}: ${entry.text}` : entry.text;
      })
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
      uri: character.spriteId || null,
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

export function normalizeRuntimeVariables(variables: unknown): RuntimeVariables {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return {};
  return { ...(variables as RuntimeVariables) };
}

export function buildNextPlaybackState(
  previous: PlaybackState,
  sceneId: string,
  choicesMade: { sceneId: string; choiceId: string }[] | undefined,
  variables: RuntimeVariables | undefined,
): PlaybackState {
  return {
    storyId: previous.storyId,
    currentSceneId: sceneId,
    isPlaying: true,
    currentDialogueIndex: 0,
    choicesMade: choicesMade ?? previous.choicesMade,
    variables: normalizeRuntimeVariables(variables),
  };
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
    variables: normalizeRuntimeVariables(playbackState.variables),
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
      variables: normalizeRuntimeVariables(slot.variables),
    },
  };
}
