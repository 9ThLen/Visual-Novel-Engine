import type {
  ChoiceBlockData,
  DialogueBlockData,
  SceneRecord,
  TextBlockData,
  TimelineStep,
} from '@/lib/engine/types';
import { createBlockStep } from '@/lib/engine/event-factory';
import type {
  StoryManuscriptBlock,
  StoryManuscriptDocument,
} from '@/lib/editor/story-manuscript-types';

function updateStepFromManuscriptBlock(step: TimelineStep, block: StoryManuscriptBlock): TimelineStep {
  if (block.kind === 'narration' && step.blockType === 'text') {
    const textData = step.data as TextBlockData;
    return {
      ...step,
      data: {
        ...textData,
        content: block.content,
      },
    };
  }

  if (block.kind === 'dialogue' && step.blockType === 'dialogue') {
    const dialogueData = step.data as DialogueBlockData;
    return {
      ...step,
      data: {
        ...dialogueData,
        entries: block.entries,
      },
    };
  }

  if (block.kind === 'choice_group' && step.blockType === 'choice') {
    const choiceData = step.data as ChoiceBlockData;
    return {
      ...step,
      data: {
        ...choiceData,
        options: block.options,
      },
    };
  }

  return step;
}

function createStepFromManuscriptBlock(block: StoryManuscriptBlock): TimelineStep {
  const nextStep = createBlockStep(block.stepBlockType);
  return {
    ...updateStepFromManuscriptBlock(nextStep, block),
    enabled: block.enabled,
    collapsed: block.collapsed,
  };
}

export function applyStoryManuscriptChanges(
  manuscript: StoryManuscriptDocument,
  sceneRecords: SceneRecord[]
): SceneRecord[] {
  const sectionsById = new Map(manuscript.scenes.map((scene) => [scene.sceneId, scene]));

  return sceneRecords.map((sceneRecord) => {
    const sceneSection = sectionsById.get(sceneRecord.id);
    if (!sceneSection) {
      return sceneRecord;
    }

    const originalStepsById = new Map(sceneRecord.timeline.map((step) => [step.id, step]));
    const nextTimeline = sceneSection.blocks.flatMap((block) => {
      const originalStep = originalStepsById.get(block.sourceStepId);
      if (!originalStep) {
        return [createStepFromManuscriptBlock(block)];
      }

      return [updateStepFromManuscriptBlock(originalStep, block)];
    });

    return {
      ...sceneRecord,
      name: sceneSection.sceneName,
      timeline: nextTimeline,
    };
  });
}
