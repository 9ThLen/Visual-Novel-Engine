import { create } from 'zustand';

import type { ChoiceSelectionMap } from '@/lib/document-editor/story-path';

/**
 * Which branch of each choice block the author is currently viewing in the
 * document editor, keyed by story. Deliberately NOT persisted: selections are
 * editing UI state, not story data — after a restart the document opens on
 * default (first-option) branches.
 */
interface BranchSelectionsState {
  selectionsByStory: Record<string, ChoiceSelectionMap>;
  selectChoiceOption: (storyId: string, choiceStepId: string, optionId: string) => void;
  clearStorySelections: (storyId: string) => void;
}

export const useBranchSelections = create<BranchSelectionsState>((set) => ({
  selectionsByStory: {},
  selectChoiceOption: (storyId, choiceStepId, optionId) =>
    set((state) => ({
      selectionsByStory: {
        ...state.selectionsByStory,
        [storyId]: {
          ...state.selectionsByStory[storyId],
          [choiceStepId]: optionId,
        },
      },
    })),
  clearStorySelections: (storyId) =>
    set((state) => {
      if (!(storyId in state.selectionsByStory)) return state;
      const next = { ...state.selectionsByStory };
      delete next[storyId];
      return { selectionsByStory: next };
    }),
}));

const EMPTY_SELECTIONS: ChoiceSelectionMap = {};

export const selectBranchSelections = (storyId: string | undefined) =>
  (state: BranchSelectionsState): ChoiceSelectionMap =>
    (storyId ? state.selectionsByStory[storyId] : undefined) ?? EMPTY_SELECTIONS;
