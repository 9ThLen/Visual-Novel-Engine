import { useAutoSave } from '@/hooks/useAutoSave';
import { useAppStore } from '@/stores/use-app-store';

export function StoryAutoSave() {
  const playbackState = useAppStore((s) => s.playbackState);
  const syncAutoSave = useAppStore((s) => s.syncAutoSave);
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);

  useAutoSave({
    playbackState,
    runtimeSnapshot: { storiesMetadata, sceneRecordsByStory },
    onAutoSave: async (newSlot) => {
      syncAutoSave(newSlot);
    },
    enabled: !!playbackState?.isPlaying,
  });

  return null;
}
