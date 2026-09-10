import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { RuntimeVideoState } from '@/lib/engine/runtime-types';
import { SceneVideoLayer } from '@/components/reader/SceneVideoLayer';

const SKIP_TICK_MS = 250;

interface SceneCutsceneLayerProps {
  video: RuntimeVideoState;
  colors: ReturnType<typeof useColors>;
  /** Called once when the clip finished or the viewer skipped it. */
  onResolve: (reason: 'ended' | 'skipped' | 'recovered') => void;
}

/**
 * The blocking half of a cutscene: it covers the scene, swallows the taps that
 * would otherwise advance the story, and owns the only ways out.
 *
 * Every exit is funnelled through resolveOnce, because the timeline must be
 * released exactly once — a player that fires its completion twice, or a Skip
 * pressed while the end event is already in flight, must not advance twice.
 */
export function SceneCutsceneLayer({ video, colors, onResolve }: SceneCutsceneLayerProps) {
  const { t } = useI18n();
  const [playedMs, setPlayedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [playRequest, setPlayRequest] = useState(0);
  const resolvedRef = useRef(false);

  const resolveOnce = useCallback((reason: 'ended' | 'skipped' | 'recovered') => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolve(reason);
  }, [onResolve]);

  // Skip eligibility counts actual playback: waiting on an autoplay prompt or a
  // backgrounded app must not bring the button closer.
  useEffect(() => {
    if (!isPlaying || video.skippableAfterMs === null) return;
    const timer = setInterval(() => setPlayedMs((current) => current + SKIP_TICK_MS), SKIP_TICK_MS);
    return () => clearInterval(timer);
  }, [isPlaying, video.skippableAfterMs]);

  const canSkip = video.skippableAfterMs !== null && playedMs >= video.skippableAfterMs;
  // A clip that cannot play and cannot be skipped would trap the reader for
  // good, so a failure always offers a way onward.
  const showRecovery = failure !== null;
  const showTapToPlay = !failure && !isPlaying && playedMs === 0;

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <SceneVideoLayer
        video={video}
        onEnded={() => resolveOnce('ended')}
        onPlayingChange={setIsPlaying}
        onPlaybackError={setFailure}
        playRequest={playRequest}
      />

      {showTapToPlay ? (
        <Pressable
          style={styles.centeredAction}
          onPress={() => setPlayRequest((current) => current + 1)}
          accessibilityRole="button"
          accessibilityLabel={t('reader.cutscene.tapToPlay')}
        >
          <Text style={[styles.actionText, { color: colors.foreground, backgroundColor: colors.surface }]}>
            {t('reader.cutscene.tapToPlay')}
          </Text>
        </Pressable>
      ) : null}

      {showRecovery ? (
        <Pressable
          style={styles.centeredAction}
          onPress={() => resolveOnce('recovered')}
          accessibilityRole="button"
          accessibilityLabel={t('reader.cutscene.continue')}
        >
          <Text style={[styles.actionText, { color: colors.foreground, backgroundColor: colors.surface }]}>
            {t('reader.cutscene.continue')}
          </Text>
        </Pressable>
      ) : null}

      {canSkip && !showRecovery ? (
        <Pressable
          style={styles.skipButton}
          onPress={() => resolveOnce('skipped')}
          accessibilityRole="button"
          accessibilityLabel={t('reader.cutscene.skip')}
        >
          <Text style={[styles.skipText, { color: colors.foreground, backgroundColor: colors.surface }]}>
            {t('reader.cutscene.skip')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  centeredAction: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    fontSize: 15,
    fontWeight: '700',
    overflow: 'hidden',
  },
  skipButton: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  skipText: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.9,
    overflow: 'hidden',
  },
});
