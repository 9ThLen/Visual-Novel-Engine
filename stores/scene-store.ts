import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Scene, TimelineEvent } from '../lib/scene-types';
import { AtomBlock } from '../lib/atom-types';
import { MoleculeBlock } from '../lib/molecule-types';

type SceneStore = {
  scenes: Scene[];
  activeSceneId: string | null;
  addScene: (scene: Scene) => void;
  removeScene: (id: string) => void;
  setActiveScene: (id: string | null) => void;
  updateSceneName: (id: string, name: string) => void;
  addElement: (sceneId: string, element: AtomBlock | MoleculeBlock) => void;
  removeElement: (sceneId: string, elementId: string) => void;
  addTimelineEvent: (sceneId: string, event: TimelineEvent) => void;
  removeTimelineEvent: (sceneId: string, eventId: string) => void;
  updateTimelineEvent: (sceneId: string, eventId: string, updates: Partial<TimelineEvent>) => void;
  batchUpdateTimelineEvents: (sceneId: string, events: TimelineEvent[]) => void;
  updateElement: (sceneId: string, elementId: string, updates: Partial<AtomBlock | MoleculeBlock>) => void;
  batchUpdateElements: (sceneId: string, elements: Array<AtomBlock | MoleculeBlock>) => void;
};

export const useSceneStore = create<SceneStore>()(
  persist(
    (set) => ({
      scenes: [],
      activeSceneId: null,

      addScene: (scene) =>
        set((state) => ({
          scenes: [...state.scenes, scene],
        })),

      removeScene: (id) =>
        set((state) => ({
          scenes: state.scenes.filter((scene) => scene.id !== id),
        })),

      setActiveScene: (id) =>
        set({
          activeSceneId: id,
        }),

      updateSceneName: (id, name) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === id ? { ...scene, name, updatedAt: new Date() } : scene
          ),
        })),

      addElement: (sceneId, element) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? { ...scene, elements: [...scene.elements, element], updatedAt: new Date() }
              : scene
          ),
        })),

      removeElement: (sceneId, elementId) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? {
                  ...scene,
                  elements: scene.elements.filter((el) => el.id !== elementId),
                  updatedAt: new Date(),
                }
              : scene
          ),
        })),

      addTimelineEvent: (sceneId, event) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? { ...scene, timeline: [...scene.timeline, event], updatedAt: new Date() }
              : scene
          ),
        })),

      removeTimelineEvent: (sceneId, eventId) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? {
                  ...scene,
                  timeline: scene.timeline.filter((ev) => ev.id !== eventId),
                  updatedAt: new Date(),
                }
              : scene
          ),
        })),

      updateTimelineEvent: (sceneId, eventId, updates) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? {
                  ...scene,
                  timeline: scene.timeline.map((ev) =>
                    ev.id === eventId ? { ...ev, ...updates } : ev
                  ),
                  updatedAt: new Date(),
                }
              : scene
          ),
        })),
      
      batchUpdateTimelineEvents: (sceneId, events) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? { ...scene, timeline: events, updatedAt: new Date() }
              : scene
          ),
        })),

      updateElement: (sceneId, elementId, updates) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? {
                  ...scene,
                  elements: scene.elements.map((el) =>
                    el.id === elementId ? { ...el, ...updates } as (AtomBlock | MoleculeBlock) : el
                  ),
                  updatedAt: new Date(),
                }
              : scene
          ),
        })),

      batchUpdateElements: (sceneId, elements) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? { ...scene, elements, updatedAt: new Date() }
              : scene
          ),
        })),
    }),
    {
      name: 'scene-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
