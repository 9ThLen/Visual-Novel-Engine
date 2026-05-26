import type { BlockType, ChoiceOption, DialogueEntry, SceneRecord } from '@/lib/engine/types';

export interface StoryManuscriptDocument {
  storyId: string;
  title: string;
  description?: string;
  author?: string;
  scenes: StoryManuscriptScene[];
}

export interface StoryManuscriptScene {
  sceneId: SceneRecord['id'];
  sceneName: SceneRecord['name'];
  blocks: StoryManuscriptBlock[];
}

interface BaseStoryManuscriptBlock {
  id: string;
  sourceStepId: string;
  stepBlockType: BlockType;
  enabled: boolean;
  collapsed: boolean;
}

export interface StoryManuscriptNarrationBlock extends BaseStoryManuscriptBlock {
  kind: 'narration';
  content: string;
}

export interface StoryManuscriptDialogueBlock extends BaseStoryManuscriptBlock {
  kind: 'dialogue';
  entries: DialogueEntry[];
}

export interface StoryManuscriptChoiceGroupBlock extends BaseStoryManuscriptBlock {
  kind: 'choice_group';
  options: ChoiceOption[];
}

export interface StoryManuscriptTechnicalMarkerBlock extends BaseStoryManuscriptBlock {
  kind: 'technical_marker';
  label: string;
}

export type StoryManuscriptBlock =
  | StoryManuscriptNarrationBlock
  | StoryManuscriptDialogueBlock
  | StoryManuscriptChoiceGroupBlock
  | StoryManuscriptTechnicalMarkerBlock;
