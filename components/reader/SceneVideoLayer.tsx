import { useEvent, useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { resolveAssetUri } from '@/lib/asset-resolver';
import type { RuntimeVideoState } from '@/lib/engine/runtime-types';
import type { ImageSource } from '@/hooks/useSceneImages';

/**
 * How long playback may stay stalled after play() before we call it blocked.
 * expo-video's web player swallows the promise from HTMLVideoElement.play(),
 * so a rejected autoplay is only observable as "asked to play, never started".
 */
const PLAYBACK_START_GRACE_MS = 1200;

interface SceneVideoLayerProps {
  video: RuntimeVideoState;
  style?: StyleProp<ViewStyle>;
  /** When false the clip is not decoded at all; the poster stands in for it. */
  enabled?: boolean;
  onPlaybackError?: (message: string) => void;
  /** Reached its natural end (or `endAt`) and is not looping. */
  onEnded?: () => void;
  /** Whether the clip is actually rolling — drives a cutscene's Skip timer. */
  onPlayingChange?: (playing: boolean) => void;
  /**
   * Bump to ask the player to try again after a blocked autoplay: the retry has
   * to originate from the viewer's tap to satisfy the browser.
   */
  playRequest?: number;
}

export function SceneVideoLayer({
  video,
  style,
  enabled = true,
  onPlaybackError,
  onEnded,
  onPlayingChange,
  playRequest = 0,
}: SceneVideoLayerProps) {
  const [source, setSource] = useState<VideoSource>(null);
  const [posterSource, setPosterSource] = useState<ImageSource | null>(null);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [resolutionFailed, setResolutionFailed] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const startAt = video.startAt ?? 0;
  const endAt = video.endAt ?? null;

  // Callers may pass an inline callback. Reading it through a ref keeps the
  // asset resolution effect from re-running — and re-resolving the URI — on
  // every render of the parent.
  const errorHandlerRef = useRef(onPlaybackError);
  errorHandlerRef.current = onPlaybackError;
  const reportError = useCallback((message: string) => {
    errorHandlerRef.current?.(message);
  }, []);
  const endedHandlerRef = useRef(onEnded);
  endedHandlerRef.current = onEnded;
  const playingHandlerRef = useRef(onPlayingChange);
  playingHandlerRef.current = onPlayingChange;

  useEffect(() => {
    let active = true;
    setSource(null);
    setHasFirstFrame(false);
    setResolutionFailed(false);
    setPlaybackBlocked(false);
    if (!enabled) return () => { active = false; };
    void resolveAssetUri(video.assetId)
      .then((resolved) => {
        if (!active) return;
        setSource(resolved);
        setResolutionFailed(resolved === null);
        if (resolved === null) reportError(`Unable to resolve video asset ${video.assetId}`);
      })
      .catch((error) => {
        if (!active) return;
        setSource(null);
        setResolutionFailed(true);
        reportError(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, [enabled, reportError, video.assetId]);

  useEffect(() => {
    let active = true;
    setPosterSource(null);
    if (video.posterAssetId) {
      void resolveAssetUri(video.posterAssetId)
        .then((resolved) => {
          if (active) setPosterSource(resolved);
        })
        .catch(() => {
          if (active) setPosterSource(null);
        });
    }
    return () => { active = false; };
  }, [video.posterAssetId]);

  const player = useVideoPlayer(source, (nextPlayer) => {
    nextPlayer.keepScreenOnWhilePlaying = false;
  });
  const playerState = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });

  // Platform looping always restarts at 0 and never stops at `endAt`, so it is
  // only correct for a plain full-file loop. Every other case is driven from
  // the playToEnd/timeUpdate listeners below.
  const platformLoop = video.loop && startAt === 0 && endAt === null;
  const backgrounded = useRef(false);

  useEffect(() => {
    if (!source) return;
    player.loop = platformLoop;
    player.muted = video.muted;
    player.volume = video.volume;
    player.playbackRate = video.playbackRate;
    player.timeUpdateEventInterval = endAt === null ? 0 : 0.25;
    player.play();
    return () => player.pause();
  }, [
    endAt,
    platformLoop,
    player,
    source,
    video.muted,
    video.playbackRate,
    video.volume,
  ]);

  // Seeking before the player reports readyToPlay is dropped on native, so the
  // initial `startAt` is applied once the source is actually loaded.
  const appliedSeekKeyRef = useRef<string | null>(null);
  const seekKey = `${video.assetId}:${startAt}`;
  useEffect(() => {
    if (!source || startAt <= 0) return;
    if (playerState.status !== 'readyToPlay') return;
    if (appliedSeekKeyRef.current === seekKey) return;
    appliedSeekKeyRef.current = seekKey;
    player.currentTime = startAt;
  }, [player, playerState.status, seekKey, source, startAt]);

  // A clip that keeps decoding behind a backgrounded app burns battery for a
  // picture nobody can see.
  useEffect(() => {
    if (!source) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (!backgrounded.current) return;
        backgrounded.current = false;
        player.play();
        return;
      }
      backgrounded.current = true;
      player.pause();
    });
    return () => subscription.remove();
  }, [player, source]);

  useEventListener(player, 'playToEnd', () => {
    if (!video.loop) {
      endedHandlerRef.current?.();
      return;
    }
    player.currentTime = startAt;
    player.play();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (endAt === null || currentTime < endAt) return;
    player.currentTime = startAt;
    if (video.loop) {
      player.play();
      return;
    }
    player.pause();
    // `endAt` is a natural end as far as the timeline is concerned.
    endedHandlerRef.current?.();
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    playingHandlerRef.current?.(isPlaying);
  });

  // A blocked autoplay can only be retried from a real user gesture, which the
  // caller turns into a bumped playRequest.
  useEffect(() => {
    if (playRequest <= 0 || !source) return;
    setPlaybackBlocked(false);
    player.play();
  }, [playRequest, player, source]);

  useEffect(() => {
    if (playerState.status !== 'error') return;
    const message = playerState.error?.message ?? `Unable to play video asset ${video.assetId}`;
    reportError(message);
    if (__DEV__) console.warn('[SceneVideoLayer]', message);
  }, [playerState.error, playerState.status, reportError, video.assetId]);

  // player.play() returns void and the web implementation does not surface a
  // rejected autoplay, so a clip that is ready but never starts is the only
  // signal we get. Without this the reader just shows black.
  useEffect(() => {
    if (!source || playerState.status !== 'readyToPlay') return;
    const timer = setTimeout(() => {
      if (backgrounded.current || player.playing) return;
      setPlaybackBlocked(true);
      const message = `Playback did not start for video asset ${video.assetId}`;
      reportError(message);
      if (__DEV__) console.warn('[SceneVideoLayer]', message);
    }, PLAYBACK_START_GRACE_MS);
    return () => clearTimeout(timer);
  }, [player, playerState.status, reportError, source, video.assetId]);

  const failed = resolutionFailed || playerState.status === 'error' || playbackBlocked;
  const showPlayer = enabled && !!source && !failed;
  const showPoster = !!posterSource && (!showPlayer || !hasFirstFrame);

  return (
    <View pointerEvents="none" style={[styles.layer, failed || !enabled ? null : styles.backdrop, style]}>
      {showPlayer ? (
        <VideoView
          player={player}
          style={styles.player}
          contentFit={video.fit}
          nativeControls={false}
          playsInline
          onFirstFrameRender={() => setHasFirstFrame(true)}
        />
      ) : null}
      {showPoster ? (
        <Image
          source={posterSource}
          style={styles.layer}
          contentFit={video.fit}
          cachePolicy="memory-disk"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: StyleSheet.absoluteFillObject,
  /*
   * On web expo-video spreads this style straight onto a bare <video>. CSS
   * gives an absolutely positioned replaced element its intrinsic size when
   * width is auto — right/bottom are simply ignored — so inset alone leaves the
   * clip at its own resolution in the top-left corner, with contentFit having
   * nothing to crop. The explicit size is what makes it fill.
   */
  player: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  backdrop: {
    backgroundColor: '#000000',
  },
});
