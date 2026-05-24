import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useLegoStore, selectLegoScenes } from '@/stores/use-lego-store';
import type { LegoScene } from '@/lib/lego-types';

export function useLegoDnD() {
  const scenes = useLegoStore(selectLegoScenes);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const addElement = useLegoStore((s) => s.addLegoElement);
  const removeElement = useLegoStore((s) => s.removeLegoElement);

  const handleSceneDrop = useCallback(
    (targetSceneId: string, data: { elementId: string; sourceSceneId: string }) => {
      const latestScenes = scenesRef.current;
      if (data.sourceSceneId === targetSceneId) return;
      const sourceScene = latestScenes.find((s: LegoScene) => s.id === data.sourceSceneId);
      const element = sourceScene?.elements.find((e) => e.id === data.elementId);
      if (!element || !sourceScene) return;
      addElement(targetSceneId, element);
      removeElement(data.sourceSceneId, data.elementId);
      if (Platform.OS !== 'web') {
        import('expo-haptics').then((Haptics) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }).catch(() => {});
      }
    },
    [addElement, removeElement]
  );

  return {
    handleSceneDrop,
  };
}
