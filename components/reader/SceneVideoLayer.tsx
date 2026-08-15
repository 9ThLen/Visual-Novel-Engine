import { useEvent, useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { resolveAssetUri } from '@/lib/asset-resolver';
import type { RuntimeVideoState } from '@/lib/engine/runtime-types';
import type { ImageSource } from '@/hooks/useSceneImages';

interface SceneVideoLayerProps {
  video: RuntimeVideoState;
  style?: StyleProp<ViewStyle>;
  onPlaybackError?: (message: string) => void;
}

export function SceneVideoLayer({ video, style, onPlaybackError }: SceneVideoLayerProps) {
  const [source, setSource] = useState<VideoSource>(null);
  const [posterSource, setPosterSource] = useState<ImageSource | null>(null);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [resolutionFailed, setResolutionFailed] = useState(false);

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

  useEffect(() => {
    let active = true;
    setSource(null);
    setHasFirstFrame(false);
    setResolutionFailed(false);
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
  }, [reportError, video.assetId]);

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

  useEventListener(player, 'playToEnd', () => {
    if (!video.loop) return;
    player.currentTime = startAt;
    player.play();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (endAt === null || currentTime < endAt) return;
    player.currentTime = startAt;
    if (video.loop) player.play();
    else player.pause();
  });

  useEffect(() => {
    if (playerState.status !== 'error') return;
    const message = playerState.error?.message ?? `Unable to play video asset ${video.assetId}`;
    reportError(message);
    if (__DEV__) console.warn('[SceneVideoLayer]', message);
  }, [playerState.error, playerState.status, reportError, video.assetId]);

  const failed = resolutionFailed || playerState.status === 'error';

  return (
    <View pointerEvents="none" style={[styles.layer, failed ? null : styles.backdrop, style]}>
      {source && !failed ? (
        <VideoView
          player={player}
          style={styles.layer}
          contentFit={video.fit}
          nativeControls={false}
          playsInline
          onFirstFrameRender={() => setHasFirstFrame(true)}
        />
      ) : null}
      {posterSource && (!hasFirstFrame || failed) ? (
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
  backdrop: {
    backgroundColor: '#000000',
  },
});
