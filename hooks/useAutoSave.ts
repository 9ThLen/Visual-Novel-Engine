import { useEffect, useRef } from 'react';
import type { PlaybackState, SaveSlot } from '../lib/types';
import { buildRuntimeSaveSlot } from '../lib/runtime-story';
import type { RuntimeStoryStateSnapshot } from '../lib/runtime-story';

interface AutoSaveProps {
  playbackState: PlaybackState | null;
  runtimeSnapshot: RuntimeStoryStateSnapshot;
  onAutoSave: (newSlot: SaveSlot) => Promise<void>;
  enabled: boolean;
}

export function useAutoSave({
  playbackState,
  runtimeSnapshot,
  onAutoSave,
  enabled
}: AutoSaveProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoSaveRef = useRef(onAutoSave);
  const runtimeSnapshotRef = useRef(runtimeSnapshot);
  const playbackStateRef = useRef(playbackState);
  onAutoSaveRef.current = onAutoSave;
  runtimeSnapshotRef.current = runtimeSnapshot;
  playbackStateRef.current = playbackState;

  useEffect(() => {
    if (!enabled || !playbackState || !playbackState.isPlaying) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const snapshot = runtimeSnapshotRef.current;
      const state = playbackStateRef.current;
      if (!state) return;

      const newSlot = buildRuntimeSaveSlot(
        'autosave',
        snapshot,
        state
      );
      if (!newSlot) return;

      onAutoSaveRef.current(newSlot).catch((err) => {
        if (__DEV__) console.error('[AutoSave] Save failed:', err);
      });
    }, 2000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [playbackState?.currentSceneId, playbackState?.isPlaying, playbackState?.currentDialogueIndex, playbackState?.choicesMade, enabled]);
}
