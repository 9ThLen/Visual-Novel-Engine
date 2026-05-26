import type {
  ChoiceBlockData,
  DialogueBlockData,
  SceneRecord,
  TextBlockData,
} from '@/lib/engine/types';
import { createBlockStep } from '@/lib/engine/event-factory';
import type { StoryMetadata } from '@/lib/story-domain';
import {
  applyStoryManuscriptChanges,
} from '@/lib/editor/story-manuscript-save';
import type {
  StoryManuscriptBlock,
  StoryManuscriptDocument,
} from '@/lib/editor/story-manuscript-types';

function toManuscriptBlockLabel(blockType: SceneRecord['timeline'][number]['blockType']): string {
  switch (blockType) {
    case 'background':
      return 'Background';
    case 'character':
      return 'Character';
    case 'music':
      return 'Music';
    case 'sound':
      return 'Sound';
    case 'effect':
      return 'Effect';
    case 'transition':
      return 'Transition';
    case 'camera':
      return 'Camera';
    case 'variable':
      return 'Variable';
    case 'interactive_object':
      return 'Interactive Object';
    default:
      return blockType;
  }
}

function buildManuscriptBlock(step: SceneRecord['timeline'][number]): StoryManuscriptBlock {
  const baseBlock = {
    id: step.id,
    sourceStepId: step.id,
    stepBlockType: step.blockType,
    enabled: step.enabled,
    collapsed: step.collapsed,
  } as const;

  if (step.blockType === 'text') {
    const textData = step.data as TextBlockData;
    return {
      ...baseBlock,
      kind: 'narration',
      content: textData.content,
    };
  }

  if (step.blockType === 'dialogue') {
    const dialogueData = step.data as DialogueBlockData;
    return {
      ...baseBlock,
      kind: 'dialogue',
      entries: [...dialogueData.entries],
    };
  }

  if (step.blockType === 'choice') {
    const choiceData = step.data as ChoiceBlockData;
    return {
      ...baseBlock,
      kind: 'choice_group',
      options: [...choiceData.options],
    };
  }

  return {
    ...baseBlock,
    kind: 'technical_marker',
    label: toManuscriptBlockLabel(step.blockType),
  };
}

export function createEmptyStoryManuscriptBlock(kind: 'narration' | 'dialogue' | 'choice_group'): StoryManuscriptBlock {
  if (kind === 'narration') {
    return buildManuscriptBlock(createBlockStep('text'));
  }

  if (kind === 'dialogue') {
    return buildManuscriptBlock(createBlockStep('dialogue'));
  }

  return buildManuscriptBlock(createBlockStep('choice'));
}

export function buildStoryManuscript(
  metadata: StoryMetadata,
  sceneRecords: SceneRecord[]
): StoryManuscriptDocument {
  return {
    storyId: metadata.id,
    title: metadata.title,
    description: metadata.description,
    author: metadata.author,
    scenes: [...sceneRecords]
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((sceneRecord) => ({
        sceneId: sceneRecord.id,
        sceneName: sceneRecord.name,
        blocks: sceneRecord.timeline.map(buildManuscriptBlock),
      })),
  };
}

export function moveStoryManuscriptSceneBlock(
  manuscript: StoryManuscriptDocument,
  sceneId: string,
  fromIndex: number,
  toIndex: number
): StoryManuscriptDocument {
  return {
    ...manuscript,
    scenes: manuscript.scenes.map((scene) => {
      if (scene.sceneId !== sceneId) {
        return scene;
      }

      const nextBlocks = [...scene.blocks];
      const [movedBlock] = nextBlocks.splice(fromIndex, 1);
      if (!movedBlock) {
        return scene;
      }

      nextBlocks.splice(toIndex, 0, movedBlock);
      return {
        ...scene,
        blocks: nextBlocks,
      };
    }),
  };
}

export { applyStoryManuscriptChanges };
export type {
  StoryManuscriptBlock,
  StoryManuscriptDocument,
  StoryManuscriptScene,
} from '@/lib/editor/story-manuscript-types';
