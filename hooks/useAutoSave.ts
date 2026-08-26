import { useEffect, useRef } from 'react';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SaveSlot } from '@/lib/story-domain';
import { buildCanonicalSaveSlot, type ReaderRuntimeSnapshot } from '../lib/reader-runtime';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';

interface AutoSaveProps {
  playbackState: PlaybackState | null;
  runtimeSnapshot: ReaderRuntimeSnapshot;
  onAutoSave: (newSlot: SaveSlot) => Promise<void>;
  enabled: boolean;
  activeThumbnailUri?: string | null;
}

export function useAutoSave({
  playbackState,
  runtimeSnapshot,
  onAutoSave,
  enabled,
  activeThumbnailUri,
}: AutoSaveProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoSaveRef = useRef(onAutoSave);
  const runtimeSnapshotRef = useRef(runtimeSnapshot);
  const playbackStateRef = useRef(playbackState);
  const activeThumbnailUriRef = useRef(activeThumbnailUri);
  onAutoSaveRef.current = onAutoSave;
  runtimeSnapshotRef.current = runtimeSnapshot;
  playbackStateRef.current = playbackState;
  activeThumbnailUriRef.current = activeThumbnailUri;

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

      const newSlot = buildCanonicalSaveSlot(
        'autosave',
        snapshot,
        state,
        activeThumbnailUriRef.current,
      );
      if (!newSlot) return;

      onAutoSaveRef.current(newSlot).catch((err) => {
        ErrorHandler.handle('Auto-save failed', err, ErrorCategory.STORAGE);
      });
    }, 2000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [playbackState?.currentSceneId, playbackState?.isPlaying, playbackState?.currentDialogueIndex, playbackState?.choicesMade, playbackState?.variables, enabled]);
}
