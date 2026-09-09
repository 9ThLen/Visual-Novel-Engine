import { create } from 'zustand';

import type { ChoiceSelectionMap } from '@/lib/document-editor/story-path';

/**
 * How the document lays out scenes: 'path' renders the active branch path
 * (choices filter the document), 'all' renders every scene sequentially with
 * no filtering — an overview mode toggled from the breadcrumb.
 */
export type DocumentViewMode = 'path' | 'all';

/**
 * Which branch of each choice block the author is currently viewing in the
 * document editor, keyed by story. Deliberately NOT persisted: selections are
 * editing UI state, not story data — after a restart the document opens on
 * default (first-option) branches.
 */
interface BranchSelectionsState {
  selectionsByStory: Record<string, ChoiceSelectionMap>;
  /** Lives here (not in route state) so it survives route pushes within a session. */
  viewModeByStory: Record<string, DocumentViewMode>;
  selectChoiceOption: (storyId: string, choiceStepId: string, optionId: string) => void;
  setDocumentViewMode: (storyId: string, mode: DocumentViewMode) => void;
  clearStorySelections: (storyId: string) => void;
}

export const useBranchSelections = create<BranchSelectionsState>((set) => ({
  selectionsByStory: {},
  viewModeByStory: {},
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
  setDocumentViewMode: (storyId, mode) =>
    set((state) => ({
      viewModeByStory: {
        ...state.viewModeByStory,
        [storyId]: mode,
      },
    })),
  clearStorySelections: (storyId) =>
    set((state) => {
      if (!(storyId in state.selectionsByStory) && !(storyId in state.viewModeByStory)) return state;
      const nextSelections = { ...state.selectionsByStory };
      delete nextSelections[storyId];
      const nextViewModes = { ...state.viewModeByStory };
      delete nextViewModes[storyId];
      return { selectionsByStory: nextSelections, viewModeByStory: nextViewModes };
    }),
}));

const EMPTY_SELECTIONS: ChoiceSelectionMap = {};

export const selectBranchSelections = (storyId: string | undefined) =>
  (state: BranchSelectionsState): ChoiceSelectionMap =>
    (storyId ? state.selectionsByStory[storyId] : undefined) ?? EMPTY_SELECTIONS;

export const selectDocumentViewMode = (storyId: string | undefined) =>
  (state: BranchSelectionsState): DocumentViewMode =>
    (storyId ? state.viewModeByStory[storyId] : undefined) ?? 'path';
