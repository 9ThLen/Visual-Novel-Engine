import { create } from 'zustand';
import { LegoScene, TimelineEvent } from '@/lib/lego-types';
import { AtomBlock } from '@/lib/atom-types';
import { MoleculeBlock } from '@/lib/molecule-types';

interface LegoState {
  legoScenes: LegoScene[];
  legoActiveSceneId: string | null;
}

interface LegoActions {
  hydrateLegoScenes: (data: { scenes: LegoScene[]; activeSceneId: string | null }) => void;
  addLegoScene: (scene: LegoScene) => void;
  removeLegoScene: (id: string) => void;
  setLegoActiveScene: (id: string | null) => void;
  updateLegoSceneName: (id: string, name: string) => void;
  addLegoElement: (sceneId: string, element: AtomBlock | MoleculeBlock) => void;
  removeLegoElement: (sceneId: string, elementId: string) => void;
  addLegoTimelineEvent: (sceneId: string, event: TimelineEvent) => void;
  removeLegoTimelineEvent: (sceneId: string, eventId: string) => void;
  updateLegoTimelineEvent: (sceneId: string, eventId: string, updates: Partial<TimelineEvent>) => void;
  batchUpdateLegoTimelineEvents: (sceneId: string, events: TimelineEvent[]) => void;
  updateLegoElement: (sceneId: string, elementId: string, updates: Partial<AtomBlock | MoleculeBlock>) => void;
  batchUpdateLegoElements: (sceneId: string, elements: (AtomBlock | MoleculeBlock)[]) => void;
}

type LegoStore = LegoState & LegoActions;

export const useLegoStore = create<LegoStore>()((set) => ({
  legoScenes: [],
  legoActiveSceneId: null,

  hydrateLegoScenes: (data) => set({ legoScenes: data.scenes, legoActiveSceneId: data.activeSceneId }),

  addLegoScene: (scene) =>
    set((state) => ({ legoScenes: [...state.legoScenes, scene] })),

  removeLegoScene: (id) =>
    set((state) => ({ legoScenes: state.legoScenes.filter((s) => s.id !== id) })),

  setLegoActiveScene: (id) => set({ legoActiveSceneId: id }),

  updateLegoSceneName: (id, name) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === id ? { ...s, name, updatedAt: new Date() } : s
      ),
    })),

  addLegoElement: (sceneId, element) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === sceneId
          ? { ...s, elements: [...s.elements, element], updatedAt: new Date() }
          : s
      ),
    })),

  removeLegoElement: (sceneId, elementId) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === sceneId
          ? { ...s, elements: s.elements.filter((el) => el.id !== elementId), updatedAt: new Date() }
          : s
      ),
    })),

  addLegoTimelineEvent: (sceneId, event) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === sceneId
          ? { ...s, timeline: [...s.timeline, event], updatedAt: new Date() }
          : s
      ),
    })),

  removeLegoTimelineEvent: (sceneId, eventId) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === sceneId
          ? { ...s, timeline: s.timeline.filter((ev) => ev.id !== eventId), updatedAt: new Date() }
          : s
      ),
    })),

  updateLegoTimelineEvent: (sceneId, eventId, updates) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              timeline: s.timeline.map((ev) => ev.id === eventId ? { ...ev, ...updates } : ev),
              updatedAt: new Date(),
            }
          : s
      ),
    })),

  batchUpdateLegoTimelineEvents: (sceneId, events) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === sceneId ? { ...s, timeline: events, updatedAt: new Date() } : s
      ),
    })),

  updateLegoElement: (sceneId, elementId, updates) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              elements: s.elements.map((el) =>
                el.id === elementId ? { ...el, ...updates } as (AtomBlock | MoleculeBlock) : el
              ),
              updatedAt: new Date(),
            }
          : s
      ),
    })),

  batchUpdateLegoElements: (sceneId, elements) =>
    set((state) => ({
      legoScenes: state.legoScenes.map((s) =>
        s.id === sceneId ? { ...s, elements, updatedAt: new Date() } : s
      ),
    })),
}));

export const selectLegoScenes = (state: LegoStore) => state.legoScenes;
export const selectLegoActiveSceneId = (state: LegoStore) => state.legoActiveSceneId;
export const selectLegoSceneById = (id: string) => (state: LegoStore) =>
  state.legoScenes.find((s) => s.id === id) ?? null;
export const selectLegoActiveScene = (state: LegoStore) =>
  state.legoActiveSceneId
    ? state.legoScenes.find((s) => s.id === state.legoActiveSceneId) ?? null
    : null;
export const selectLegoSceneIds = (state: LegoStore) =>
  state.legoScenes.map((s) => s.id);
export const selectLegoSceneCount = (state: LegoStore) => state.legoScenes.length;
