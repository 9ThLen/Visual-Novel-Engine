/**
 * One preview player for the whole media library screen.
 *
 * A player per tile would be a player per file in the story: every one of them
 * holding a lease on a resolved URI, and any number of them audible at once.
 * The screen keeps a single controller instead, the grid and the inspector both
 * drive it, and starting one file stops whatever was playing.
 *
 * Deliberately not `AudioPlayerService` / `AudioManager`: those own the reader's
 * tracks, and auditioning a file in the library must not duck or stop the BGM
 * of a scene the author has open.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';

import { acquireResolvedAssetUri } from '@/lib/asset-resolver';

export interface AudioPreviewTarget {
  key: string;
  /** Preferred over `uri`: it survives a reload, a runtime blob: does not. */
  assetId?: string;
  uri: string;
}

export interface AudioPreview {
  /** Key of the item currently playing, or null. */
  playingKey: string | null;
  /** 0–1 through the current track; 0 while it is still loading. */
  progress: number;
  /** Key of the item whose last attempt failed, so the UI can offer a retry. */
  failedKey: string | null;
  /** Play this item, or stop it if it is the one already playing. */
  toggle: (target: AudioPreviewTarget) => void;
  stop: () => void;
}

export function useAudioPreview(): AudioPreview {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const playerRef = useRef<AudioPlayer | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  /**
   * Resolving is async and the author can tap another tile while it runs. Every
   * start takes a token; a start that comes back holding a stale one has been
   * overtaken and must undo itself rather than seize the controller.
   */
  const startToken = useRef(0);

  const teardown = useCallback(() => {
    startToken.current += 1;
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      // `remove` alone leaves the sound running for a beat on web.
      try {
        player.pause();
      } catch {
        // Already torn down by the platform; the release below still matters.
      }
      player.remove();
    }
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);

  const stop = useCallback(() => {
    teardown();
    setPlayingKey(null);
    setProgress(0);
  }, [teardown]);

  const toggle = useCallback((target: AudioPreviewTarget) => {
    if (playerRef.current && playingKey === target.key) {
      stop();
      return;
    }

    teardown();
    const token = startToken.current;
    setPlayingKey(target.key);
    setProgress(0);
    setFailedKey(null);

    void acquireResolvedAssetUri(target.assetId ?? target.uri)
      .then((lease) => {
        // Overtaken while resolving: hand the pin straight back, or it leaks
        // for as long as the screen lives.
        if (token !== startToken.current) {
          lease.release();
          return;
        }
        if (lease.source === null || typeof lease.source !== 'string') {
          lease.release();
          setPlayingKey(null);
          setFailedKey(target.key);
          return;
        }

        releaseRef.current = lease.release;
        const player = createAudioPlayer(lease.source);
        playerRef.current = player;
        player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if (token !== startToken.current) return;
          if (status.didJustFinish) {
            stop();
            return;
          }
          setProgress(status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0);
        });
        player.play();
      })
      .catch(() => {
        if (token !== startToken.current) return;
        setPlayingKey(null);
        setFailedKey(target.key);
      });
  }, [playingKey, stop, teardown]);

  // Leaving the screen has to silence it: nothing else holds this player, so a
  // sound left running would play on with no way to stop it.
  useEffect(() => teardown, [teardown]);

  return { playingKey, progress, failedKey, toggle, stop };
}
