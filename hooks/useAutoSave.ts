import { useEffect, useRef } from 'react';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SaveSlot } from '@/lib/story-domain';
import { buildCanonicalSaveSlot, type ReaderRuntimeSnapshot } from '../lib/reader-runtime';
import type { ReaderReleaseStamp } from '@/lib/reader-release-stamp';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';

interface AutoSaveProps {
  playbackState: PlaybackState | null;
  runtimeSnapshot: ReaderRuntimeSnapshot;
  onAutoSave: (newSlot: SaveSlot) => Promise<void>;
  enabled: boolean;
  activeThumbnailUri?: string | null;
  /** Which release this reading is happening in, if any. See `saveGame`. */
  releaseStamp?: ReaderReleaseStamp | null;
}

export function useAutoSave({
  playbackState,
  runtimeSnapshot,
  onAutoSave,
  enabled,
  activeThumbnailUri,
  releaseStamp = null,
}: AutoSaveProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoSaveRef = useRef(onAutoSave);
  const runtimeSnapshotRef = useRef(runtimeSnapshot);
  const playbackStateRef = useRef(playbackState);
  const activeThumbnailUriRef = useRef(activeThumbnailUri);
  const releaseStampRef = useRef(releaseStamp);
  onAutoSaveRef.current = onAutoSave;
  runtimeSnapshotRef.current = runtimeSnapshot;
  playbackStateRef.current = playbackState;
  activeThumbnailUriRef.current = activeThumbnailUri;
  releaseStampRef.current = releaseStamp;

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
        // An unstamped autosave is the common case, not the rare one: most
        // reading happens through the autosave slot, and without this a reader
        // who resumes after a version bump gets no warning at all.
        releaseStampRef.current,
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
