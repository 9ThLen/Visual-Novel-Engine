import { useCallback } from 'react';
import { useSceneStore } from '@/stores/scene-store';
import * as Haptics from 'expo-haptics';
import type { Scene } from '@/lib/scene-types';

export function useLegoDnD() {
  const scenes = useSceneStore((s) => s.scenes);
  const addElement = useSceneStore((s) => s.addElement);
  const removeElement = useSceneStore((s) => s.removeElement);

  const handleSceneDrop = useCallback(
    (targetSceneId: string, data: { elementId: string; sourceSceneId: string }) => {
      if (data.sourceSceneId === targetSceneId) return; // Same scene, ignore
      // Find element in source scene
      const sourceScene = scenes.find((s: Scene) => s.id === data.sourceSceneId);
      const element = sourceScene?.elements.find((e) => e.id === data.elementId);
      if (!element || !sourceScene) return;
      // Move element: add to target, remove from source
      addElement(targetSceneId, element);
      removeElement(data.sourceSceneId, data.elementId);
      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [scenes, addElement, removeElement]
  );

  return {
    handleSceneDrop,
  };
}
