/**
 * One preview player for the whole media library screen.
 *
 * A player per tile would be a player per file in the story: every one of them
 * holding a lease on a resolved URI, and any number of them audible at once.
 * The screen keeps a single controller instead, the grid and the inspector both
 * drive it, and starting one file tears the previous one down.
 *
 * Deliberately not `AudioPlayerService` / `AudioManager`: those own the reader's
 * tracks, and auditioning a file in the library must not duck or stop the BGM
 * of a scene the author has open.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';

import { acquireResolvedAssetUri } from '@/lib/asset-resolver';

/**
 * How long a file gets to start sounding before the preview calls it broken.
 *
 * There is no error to wait for. `expo-audio` on web hands `play()` to an
 * `HTMLMediaElement` and drops the promise it returns, and wires no `error`
 * handler at all, so a file that cannot decode and a play the browser refuses
 * both look exactly like one that is still loading. Every source here is local
 * — an object URL or a file on disk — so silence this long is not slowness.
 */
const START_TIMEOUT_MS = 4000;

export type AudioPreviewState = 'loading' | 'playing' | 'paused';

export interface AudioPreviewTarget {
  key: string;
  /** Preferred over `uri`: it survives a reload, a runtime blob: does not. */
  assetId?: string;
  uri: string;
}

export interface AudioPreview {
  /** Key of the item the controller is on, whether loading, playing or paused. */
  activeKey: string | null;
  state: AudioPreviewState;
  /** Key of the item currently making sound, for a tile that only shows that. */
  playingKey: string | null;
  positionSeconds: number;
  /** 0 until the platform reports one; never trust it as the file's length. */
  durationSeconds: number;
  /** 0–1 through the current track; 0 while it is still loading. */
  progress: number;
  /** Key of the item whose last attempt failed, so the UI can offer a retry. */
  failedKey: string | null;
  /** Play this item, pause it if it is already playing, resume it if paused. */
  toggle: (target: AudioPreviewTarget) => void;
  /** Jump within the track that is loaded; ignored for anything else. */
  seekTo: (seconds: number) => void;
  stop: () => void;
}

export function useAudioPreview(): AudioPreview {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [state, setState] = useState<AudioPreviewState>('loading');
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const playerRef = useRef<AudioPlayer | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Resolving is async and the author can tap another tile while it runs. Every
   * start takes a token; a start that comes back holding a stale one has been
   * overtaken and must undo itself rather than seize the controller.
   */
  const startToken = useRef(0);

  const teardown = useCallback(() => {
    startToken.current += 1;
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      // `remove` alone leaves the sound running for a beat on web.
      try {
        player.pause();
      } catch {
        // Already torn down by the platform; the release below still matters.
      }
      try {
        player.remove();
      } catch {
      }
    }
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);

  const stop = useCallback(() => {
    teardown();
    setActiveKey(null);
    setState('loading');
    setPositionSeconds(0);
    setDurationSeconds(0);
  }, [teardown]);

  const fail = useCallback((key: string) => {
    teardown();
    setActiveKey(null);
    setState('loading');
    setPositionSeconds(0);
    setDurationSeconds(0);
    setFailedKey(key);
  }, [teardown]);

  const start = useCallback((target: AudioPreviewTarget) => {
    teardown();
    const token = startToken.current;
    setActiveKey(target.key);
    setState('loading');
    setPositionSeconds(0);
    setDurationSeconds(0);
    setFailedKey(null);

    void acquireResolvedAssetUri(target.assetId ?? target.uri)
      .then((lease) => {
        // Overtaken while resolving: hand the pin straight back, or it leaks
        // for as long as the screen lives.
        if (token !== startToken.current) {
          lease.release();
          return;
        }
        if (typeof lease.source !== 'string') {
          lease.release();
          fail(target.key);
          return;
        }

        releaseRef.current = lease.release;
        try {
          const player = createAudioPlayer(lease.source);
          playerRef.current = player;
          player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
            if (token !== startToken.current) return;
            if (status.didJustFinish) {
              stop();
              return;
            }
            if (status.playing && startTimerRef.current) {
              clearTimeout(startTimerRef.current);
              startTimerRef.current = null;
            }
            setState(status.playing ? 'playing' : 'paused');
            setPositionSeconds(Number.isFinite(status.currentTime) ? status.currentTime : 0);
            setDurationSeconds(Number.isFinite(status.duration) ? status.duration : 0);
          });
          player.play();
          startTimerRef.current = setTimeout(() => {
            if (token !== startToken.current) return;
            startTimerRef.current = null;
            fail(target.key);
          }, START_TIMEOUT_MS);
        } catch {
          // Creating or starting the player threw outright — without this the
          // lease and the half-built player would be held until the next tap.
          fail(target.key);
        }
      })
      .catch(() => {
        if (token !== startToken.current) return;
        fail(target.key);
      });
  }, [fail, stop, teardown]);

  const toggle = useCallback((target: AudioPreviewTarget) => {
    // Keyed on the item, not on whether a player exists yet: while the URI is
    // still resolving the button already says Stop, and a second tap has to
    // call that resolve off rather than start a second one.
    if (activeKey !== target.key) {
      start(target);
      return;
    }

    const player = playerRef.current;
    if (!player) {
      // Still loading. Nothing to pause — drop the whole attempt.
      stop();
      return;
    }

    try {
      if (state === 'playing') {
        player.pause();
        setState('paused');
      } else {
        player.play();
        setState('playing');
      }
    } catch {
      fail(target.key);
    }
  }, [activeKey, fail, start, state, stop]);

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const target = Math.max(0, durationSeconds > 0 ? Math.min(seconds, durationSeconds) : seconds);
    try {
      void player.seekTo(target);
      // The platform reports the new position on its own schedule; moving it
      // now is what keeps the slider under the author's thumb.
      setPositionSeconds(target);
    } catch {
    }
  }, [durationSeconds]);

  // Leaving the screen has to silence it: nothing else holds this player, so a
  // sound left running would play on with no way to stop it.
  useEffect(() => teardown, [teardown]);

  return {
    activeKey,
    state,
    playingKey: state === 'playing' ? activeKey : null,
    positionSeconds,
    durationSeconds,
    progress: durationSeconds > 0 ? Math.min(1, positionSeconds / durationSeconds) : 0,
    failedKey,
    toggle,
    seekTo,
    stop,
  };
}
