import { useLegoStore, selectLegoScenes, selectLegoActiveScene, selectLegoActiveSceneId } from '@/stores/use-lego-store';
import { createLegoScene } from '@/lib/lego-types';
import type { LegoScene } from '@/lib/lego-types';
import type { AtomBlock } from '@/lib/atom-types';

export function useSceneManagement() {
  const scenes = useLegoStore(selectLegoScenes);
  const addScene = useLegoStore((s) => s.addLegoScene);
  const setActiveScene = useLegoStore((s) => s.setLegoActiveScene);
  const activeSceneId = useLegoStore(selectLegoActiveSceneId);
  const addElement = useLegoStore((s) => s.addLegoElement);
  const updateElement = useLegoStore((s) => s.updateLegoElement);
  const batchUpdateElements = useLegoStore((s) => s.batchUpdateLegoElements);

  const activeScene = useLegoStore(selectLegoActiveScene);

  const handleAddScene = () => {
    const newScene = createLegoScene(`Scene ${scenes.length + 1}`);
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
