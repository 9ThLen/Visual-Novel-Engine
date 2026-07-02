import { useMemo } from 'react';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useAppStore } from '@/stores/use-app-store';
import type { ReaderRuntimeSnapshot } from '@/lib/reader-runtime';
import { buildScopedReaderRuntimeSnapshot } from '@/lib/reader-runtime-snapshot';

export function StoryAutoSave() {
  const playbackState = useAppStore((s) => s.playbackState);
  const syncAutoSave = useAppStore((s) => s.syncAutoSave);
  const storyId = playbackState?.storyId;
  const sceneId = playbackState?.currentSceneId;
  const runtimeSnapshot = useAppStore((state) =>
    storyId && sceneId ? buildScopedReaderRuntimeSnapshot(state, storyId, sceneId) : null
  );
  const emptySnapshot = useMemo<ReaderRuntimeSnapshot>(() => ({
    storiesMetadata: [],
    sceneRecordsByStory: {},
  }), []);

  useAutoSave({
    playbackState,
    runtimeSnapshot: runtimeSnapshot ?? emptySnapshot,
    onAutoSave: async (newSlot) => {
      syncAutoSave(newSlot);
    },
    enabled: !!playbackState?.isPlaying,
  });

  return null;
}
