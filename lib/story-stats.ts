import type {
  ChoiceBlockData,
  DialogueBlockData,
  SceneRecord,
  TextBlockData,
} from '@/lib/engine/types';

export interface StoryStats {
  scenes: number;
  words: number;
  choices: number;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Aggregate authored content across a story's scenes: scene count, word count
 * (text/narration blocks plus dialogue entries), and total choice options.
 * Pure so it can be memoized in the UI and unit-tested directly.
 */
export function computeStoryStats(scenes: SceneRecord[]): StoryStats {
  let words = 0;
  let choices = 0;

  for (const scene of scenes) {
    for (const step of scene.timeline ?? []) {
      if (step.blockType === 'text') {
        words += countWords((step.data as TextBlockData).content ?? '');
      } else if (step.blockType === 'dialogue') {
        for (const entry of (step.data as DialogueBlockData).entries ?? []) {
          words += countWords(entry.text ?? '');
        }
      } else if (step.blockType === 'choice') {
        choices += ((step.data as ChoiceBlockData).options ?? []).length;
      }
    }
  }

  return { scenes: scenes.length, words, choices };
}
