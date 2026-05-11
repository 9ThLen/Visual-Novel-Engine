import React from 'react';
import { useSceneStore } from '@/stores/scene-store';
import { createScene } from '@/lib/scene-types';
import type { Scene } from '@/lib/scene-types';
import type { AtomBlock } from '@/lib/atom-types';

export function useSceneManagement() {
  const scenes = useSceneStore((s) => s.scenes);
  const addScene = useSceneStore((s) => s.addScene);
  const setActiveScene = useSceneStore((s) => s.setActiveScene);
  const activeSceneId = useSceneStore((s) => s.activeSceneId);
  const addElement = useSceneStore((s) => s.addElement);
  const updateElement = useSceneStore((s) => s.updateElement);
  const batchUpdateElements = useSceneStore((s) => s.batchUpdateElements);

  const activeScene = scenes.find((s: Scene) => s.id === activeSceneId);

  const existingIds = React.useMemo(() => 
    new Set(activeScene?.elements.map((e) => e.id) || []), 
    [activeScene?.elements]
  );

  const handleAddScene = () => {
    const newScene = createScene(`Scene ${scenes.length + 1}`);
    addScene(newScene);
    setActiveScene(newScene.id);
  };

  const handleAtomsChange = (atoms: AtomBlock[]) => {
    if (!activeSceneId || !activeScene) return;
    
    // Create a map for quick lookup of incoming atom updates
    const updatedMap = new Map(atoms.map(a => [a.id, a]));
    
    // Merge updated atoms with existing elements, preserving non-atom elements (like molecules)
    const mergedElements = activeScene.elements.map(el => {
      if (updatedMap.has(el.id)) {
        return updatedMap.get(el.id)!;
      }
      return el;
    });

    // Check for any NEW atoms that weren't in the original scene
    const existingElementIds = new Set(activeScene.elements.map(e => e.id));
    const newAtoms = atoms.filter(a => !existingElementIds.has(a.id));
    
    const finalElements = [...mergedElements, ...newAtoms];

    batchUpdateElements(activeSceneId, finalElements);
  };

  return {
    scenes,
    activeScene,
    activeSceneId,
    setActiveScene,
    handleAddScene,
    handleAtomsChange,
  };
}
