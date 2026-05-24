/**
 * stores/use-editor-store.ts — Zustand store for the new VNE Editor
 */

import { create } from 'zustand';
import type { TimelineStep, BlockType } from '@/lib/engine/types';
import { createBlockStep, duplicateStep } from '@/lib/engine/event-factory';
import { BLOCK_TYPE_INFO } from '@/lib/engine/types';
import { type EditorSceneDraft, shouldHydrateEditorSceneDraft } from '@/lib/editor-scene-draft';

const MAX_UNDO_HISTORY = 100;

interface EditorStore {
  // Scene state
  sceneId: string | null;
  sceneName: string;
  timeline: TimelineStep[];
  isDirty: boolean;
  selectedBlockId: string | null;

  // View state
  viewMode: 'edit' | 'preview' | 'flow';
  showMiniPreview: boolean;
  showBlockLibrary: boolean;
  panelWidths: { left: number; right: number };
  blockSearchQuery: string;

  // Undo/Redo (internal — not persisted)
  _undoStack: TimelineStep[][];
  _redoStack: TimelineStep[][];

  // Actions
  setScene: (sceneId: string, sceneName: string, timeline: TimelineStep[]) => void;
  hydrateSceneDraft: (draft: EditorSceneDraft) => void;
  setSceneName: (name: string) => void;
  addBlock: (blockType: BlockType, index?: number) => void;
  removeBlock: (stepId: string) => void;
  updateBlock: (stepId: string, updates: Partial<TimelineStep>) => void;
  moveBlock: (fromIndex: number, toIndex: number) => void;
  duplicateBlock: (stepId: string) => void;
  toggleBlockCollapsed: (stepId: string) => void;
  toggleBlockEnabled: (stepId: string) => void;
  selectBlock: (stepId: string | null) => void;
  undo: () => void;
  redo: () => void;
  setViewMode: (mode: EditorStore['viewMode']) => void;
  setShowMiniPreview: (show: boolean) => void;
  setShowBlockLibrary: (show: boolean) => void;
  setPanelWidths: (left: number, right: number) => void;
  setBlockSearchQuery: (query: string) => void;
  searchBlocks: (query: string) => TimelineStep[];
  clearTimeline: () => void;
  loadTimeline: (steps: TimelineStep[]) => void;
  reset: () => void;
}

const initialState: Omit<EditorStore, '_undoStack' | '_redoStack' | 'setScene' | 'hydrateSceneDraft' | 'setSceneName' | 'addBlock' | 'removeBlock' | 'updateBlock' | 'moveBlock' | 'duplicateBlock' | 'toggleBlockCollapsed' | 'toggleBlockEnabled' | 'selectBlock' | 'undo' | 'redo' | 'setViewMode' | 'setShowMiniPreview' | 'setShowBlockLibrary' | 'setPanelWidths' | 'setBlockSearchQuery' | 'searchBlocks' | 'clearTimeline' | 'loadTimeline' | 'reset'> = {
  sceneId: null,
  sceneName: '',
  timeline: [],
  isDirty: false,
  selectedBlockId: null,
  viewMode: 'edit',
  showMiniPreview: true,
  showBlockLibrary: true,
  panelWidths: { left: 280, right: 300 },
  blockSearchQuery: '',
};

export const useEditorStore = create<EditorStore>()((set, get) => ({
  ...initialState,
  _undoStack: [],
  _redoStack: [],

  setScene: (sceneId, sceneName, timeline) => set({
    sceneId, sceneName, timeline, isDirty: false, _undoStack: [], _redoStack: [],
  }),

  hydrateSceneDraft: (draft) => {
    const state = get();
    if (!draft.sceneId) return;

    if (!shouldHydrateEditorSceneDraft(
      {
        sceneId: state.sceneId,
        isDirty: state.isDirty,
        timelineLength: state.timeline.length,
      },
      {
        sceneId: draft.sceneId,
        timelineLength: draft.timeline.length,
      }
    )) {
      return;
    }

    set({
      sceneId: draft.sceneId,
      sceneName: draft.sceneName,
      timeline: draft.timeline,
      isDirty: false,
      selectedBlockId: null,
      _undoStack: [],
      _redoStack: [],
    });
  },

  setSceneName: (name) => set({ sceneName: name, isDirty: true }),

  addBlock: (blockType, index) => {
    const state = get();
    const newStep = createBlockStep(blockType);
    const newTimeline = [...state.timeline];
    if (index !== undefined && index >= 0 && index <= newTimeline.length) {
      newTimeline.splice(index, 0, newStep);
    } else {
      newTimeline.push(newStep);
    }
    set({
      timeline: newTimeline,
      isDirty: true,
      selectedBlockId: newStep.id,
      _undoStack: [...state._undoStack.slice(-MAX_UNDO_HISTORY), state.timeline],
      _redoStack: [],
    });
  },

  removeBlock: (stepId) => {
    const state = get();
    set({
      timeline: state.timeline.filter(s => s.id !== stepId),
      isDirty: true,
      selectedBlockId: state.selectedBlockId === stepId ? null : state.selectedBlockId,
      _undoStack: [...state._undoStack.slice(-MAX_UNDO_HISTORY), state.timeline],
      _redoStack: [],
    });
  },

  updateBlock: (stepId, updates) => {
    const state = get();
    set({
      timeline: state.timeline.map(s => s.id === stepId ? { ...s, ...updates } : s),
      isDirty: true,
      _undoStack: [...state._undoStack.slice(-MAX_UNDO_HISTORY), state.timeline],
      _redoStack: [],
    });
  },

  moveBlock: (fromIndex, toIndex) => {
    const state = get();
    const newTimeline = [...state.timeline];
    const [moved] = newTimeline.splice(fromIndex, 1);
    newTimeline.splice(toIndex, 0, moved);
    set({
      timeline: newTimeline, isDirty: true,
      _undoStack: [...state._undoStack.slice(-MAX_UNDO_HISTORY), state.timeline],
      _redoStack: [],
    });
  },

  duplicateBlock: (stepId) => {
    const state = get();
    const idx = state.timeline.findIndex(s => s.id === stepId);
    if (idx === -1) return;
    const dup = duplicateStep(state.timeline[idx]);
    const newTimeline = [...state.timeline];
    newTimeline.splice(idx + 1, 0, dup);
    set({
      timeline: newTimeline, isDirty: true, selectedBlockId: dup.id,
      _undoStack: [...state._undoStack.slice(-MAX_UNDO_HISTORY), state.timeline],
      _redoStack: [],
    });
  },

  toggleBlockCollapsed: (stepId) => {
    const state = get();
    set({ timeline: state.timeline.map(s => s.id === stepId ? { ...s, collapsed: !s.collapsed } : s) });
  },

  toggleBlockEnabled: (stepId) => {
    const state = get();
    set({
      timeline: state.timeline.map(s => s.id === stepId ? { ...s, enabled: !s.enabled } : s),
      isDirty: true,
    });
  },

  selectBlock: (stepId) => set({ selectedBlockId: stepId }),

  undo: () => {
    const state = get();
    if (state._undoStack.length === 0) return;
    const prev = state._undoStack[state._undoStack.length - 1];
    set({
      timeline: prev,
      _undoStack: state._undoStack.slice(0, -1),
      _redoStack: [...state._redoStack, state.timeline],
      isDirty: true,
    });
  },

  redo: () => {
    const state = get();
    if (state._redoStack.length === 0) return;
    const next = state._redoStack[state._redoStack.length - 1];
    set({
      timeline: next,
      _undoStack: [...state._undoStack, state.timeline],
      _redoStack: state._redoStack.slice(0, -1),
      isDirty: true,
    });
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setShowMiniPreview: (show) => set({ showMiniPreview: show }),
  setShowBlockLibrary: (show) => set({ showBlockLibrary: show }),
  setPanelWidths: (left, right) => set({ panelWidths: { left, right } }),
  setBlockSearchQuery: (query) => set({ blockSearchQuery: query }),

  searchBlocks: (query) => {
    const state = get();
    if (!query.trim()) return state.timeline;
    const q = query.toLowerCase();
    return state.timeline.filter(s => {
      const info = BLOCK_TYPE_INFO[s.blockType];
      return info.label.toLowerCase().includes(q) || info.description.toLowerCase().includes(q);
    });
  },

  clearTimeline: () => {
    const state = get();
    set({
      timeline: [], isDirty: true, selectedBlockId: null,
      _undoStack: [...state._undoStack.slice(-MAX_UNDO_HISTORY), state.timeline],
      _redoStack: [],
    });
  },

  loadTimeline: (steps) => set({ timeline: steps, isDirty: false, _undoStack: [], _redoStack: [] }),

  reset: () => set({ ...initialState, _undoStack: [], _redoStack: [] }),
}));

// ── Selectors ─────────────────────────────────────────────────────────────

export const selectSelectedBlock = (state: EditorStore): TimelineStep | null => {
  if (!state.selectedBlockId) return null;
  return state.timeline.find(s => s.id === state.selectedBlockId) || null;
};

export const selectCanUndo = (state: EditorStore): boolean =>
  state._undoStack.length > 0;

export const selectCanRedo = (state: EditorStore): boolean =>
  state._redoStack.length > 0;
