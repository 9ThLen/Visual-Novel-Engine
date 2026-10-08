/**
 * What the author has selected in the document editor, for the assistant.
 *
 * Deliberately outside both useAppStore and the editor's own React state:
 * nothing here is persisted, and a selection must never rerender the document
 * chrome — doing that while the browser is selecting makes the ScrollView jump.
 */
import { create } from 'zustand';

import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';

export interface EditorSelection extends VNPlateSelectionState {
  storyId: string;
  sceneId: string;
}

interface EditorContextStoreState {
  /** The most recent selection reported by any frame, until that frame goes away. */
  selection: EditorSelection | null;
  /** Set by the chip's dismiss button; a newer selection brings the chip back. */
  dismissedSeq: number | null;
  reportSelection: (storyId: string, sceneId: string, state: VNPlateSelectionState) => void;
  clearFrame: (storyId: string, sceneId: string) => void;
  clearStory: (storyId: string) => void;
  dismissSelection: () => void;
}

// Each frame counts on its own, so the floor that drops a late message is per frame.
const lastSeqByFrame = new Map<string, number>();
const frameKey = (storyId: string, sceneId: string) => `${storyId}\u0000${sceneId}`;

export const useEditorContextStore = create<EditorContextStoreState>((set, get) => ({
  selection: null,
  dismissedSeq: null,

  reportSelection: (storyId, sceneId, state) => {
    const key = frameKey(storyId, sceneId);
    if (state.seq <= (lastSeqByFrame.get(key) ?? -Infinity)) return;
    lastSeqByFrame.set(key, state.seq);
    set({ selection: { ...state, storyId, sceneId }, dismissedSeq: null });
  },

  clearFrame: (storyId, sceneId) => {
    lastSeqByFrame.delete(frameKey(storyId, sceneId));
    const current = get().selection;
    if (current?.storyId === storyId && current.sceneId === sceneId) set({ selection: null, dismissedSeq: null });
  },

  clearStory: (storyId) => {
    const prefix = `${storyId}\u0000`;
    for (const key of lastSeqByFrame.keys()) {
      if (key.startsWith(prefix)) lastSeqByFrame.delete(key);
    }
    if (get().selection?.storyId === storyId) set({ selection: null, dismissedSeq: null });
  },

  dismissSelection: () => {
    const current = get().selection;
    if (current) set({ dismissedSeq: current.seq });
  },
}));

/** The selection the chip should show: the current one, unless the author dismissed it. */
export function selectVisibleEditorSelection(state: EditorContextStoreState): EditorSelection | null {
  return state.selection && state.selection.seq !== state.dismissedSeq ? state.selection : null;
}
