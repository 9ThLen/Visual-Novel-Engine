import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useEditorStore } from '@/stores/use-editor-store';
import { useAppStore } from '@/stores/use-app-store';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { AudioPlayerService } from '@/lib/audio-player-service';
import { useI18n } from '@/lib/i18n';
import { getTimelineDisplayPages } from '@/lib/reader-runtime';
import { withAlpha } from '@/lib/_core/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';

export function PreviewScreen({ storyId, sceneId }: { storyId: string; sceneId: string }) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const editorSceneId = useEditorStore((s) => s.sceneId);
  const editorTimeline = useEditorStore((s) => s.timeline);
  const editorIsDirty = useEditorStore((s) => s.isDirty);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);

  const timeline = useMemo(
    () => {
      if (editorIsDirty && editorSceneId === sceneId) {
        return editorTimeline;
      }
      return sceneRecordsByStory[storyId]?.[sceneId]?.timeline ?? [];
    },
    [editorIsDirty, editorSceneId, editorTimeline, sceneId, sceneRecordsByStory, storyId]
  );

  const { sceneState, currentStepIndex, isComplete, isTyping, advance, selectChoice } =
    useSceneExecutor(timeline);

  const [displayedText, setDisplayedText] = useState('');
  const audioServiceRef = useRef(new AudioPlayerService());
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playedSoundEventsRef = useRef<Set<string>>(new Set());

  const currentStep = timeline[currentStepIndex];

  const currentText = useMemo(() => {
    return getTimelineDisplayPages(currentStep)[0] ?? '';
  }, [currentStep]);

  const [backgroundSource, setBackgroundSource] = useState<number | { uri: string } | null>(null);

  useEffect(() => {
    let active = true;
    if (!sceneState.backgroundAssetId) {
      setBackgroundSource(null);
      return () => { active = false; };
    }
    resolveAssetUri(sceneState.backgroundAssetId)
      .then((resolved) => {
        if (!active || !resolved) {
          if (active) setBackgroundSource(null);
          return;
        }
        setBackgroundSource(typeof resolved === 'number' ? resolved : { uri: resolved });
      })
      .catch(() => { if (active) setBackgroundSource(null); });
    return () => { active = false; };
  }, [sceneState.backgroundAssetId]);

  const prevMusicTrackRef = useRef<string | null>(null);
  useEffect(() => {
    const currentTrack = sceneState.musicTrackId;
    if (sceneState.musicAction === 'stop') {
      void audioServiceRef.current.stop('preview-bgm', sceneState.musicFadeDuration ?? 300);
      prevMusicTrackRef.current = null;
      return;
    }
    if (sceneState.musicAction === 'pause') {
      void audioServiceRef.current.pause('preview-bgm');
      return;
    }
    if (currentTrack && currentTrack !== prevMusicTrackRef.current) {
      void audioServiceRef.current.play('preview-bgm', currentTrack, {
        volume: typeof sceneState.musicVolume === 'number' ? sceneState.musicVolume : 0.8,
        loop: sceneState.musicLoop ?? true,
        fadeIn: sceneState.musicFadeDuration,
      });
    } else if (!currentTrack && prevMusicTrackRef.current) {
      void audioServiceRef.current.stop('preview-bgm', 300);
    }
    prevMusicTrackRef.current = currentTrack;
  }, [sceneState.musicAction, sceneState.musicFadeDuration, sceneState.musicLoop, sceneState.musicTrackId, sceneState.musicVolume]);

  useEffect(() => {
    for (const event of sceneState.soundEvents ?? []) {
      if (!event.assetId || playedSoundEventsRef.current.has(event.id)) continue;
      playedSoundEventsRef.current.add(event.id);
      if (event.action === 'stop') {
        void audioServiceRef.current.stop(`preview-sfx:${event.assetId}`, 100);
        continue;
      }
      const channelId = event.loop ? `preview-sfx:${event.assetId}` : `preview-sfx:${event.id}`;
      void audioServiceRef.current.play(channelId, event.assetId, {
        volume: event.volume,
        loop: event.loop,
      });
    }
  }, [sceneState.soundEvents]);

  const typewriteText = useCallback((text: string) => {
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    if (!text) { setDisplayedText(''); return; }
    setDisplayedText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayedText(text.substring(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        typewriterIntervalRef.current = null;
      }
    }, 30);
    typewriterIntervalRef.current = interval;
  }, []);

  useEffect(() => {
    if (currentText && (currentStep?.blockType === 'text' || currentStep?.blockType === 'dialogue')) {
      typewriteText(currentText);
    } else {
      setDisplayedText('');
    }
  }, [currentStepIndex, currentText, currentStep, typewriteText]);

  useEffect(() => {
    const audioService = audioServiceRef.current;
    return () => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
      void audioService.cleanup();
    };
  }, []);

  const handleAdvance = useCallback(() => {
    advance();
  }, [advance]);

  const handleChoiceSelect = useCallback((optionId: string) => {
    selectChoice(optionId);
  }, [selectChoice]);

  const handleBack = useCallback(() => {
    void audioServiceRef.current.cleanup();
    router.back();
  }, [router]);

  const surfaceContainer = colors['surface-container'] || colors.surface;
  const secondaryColor = colors.secondary || colors.primary;
  const showChoices = !!sceneState.currentChoices;
  const camera = sceneState.cameraState;
  const activeEffects = sceneState.activeEffects.filter((effect) => effect.endTime >= Date.now());
  const hasFlash = activeEffects.some((effect) => effect.effectType === 'flash');
  const hasVignette = activeEffects.some((effect) => effect.effectType === 'vignette');
  const hasShake = activeEffects.some((effect) => effect.effectType === 'shake');
  const cameraTransform = {
    transform: [
      { translateX: -2 * (camera?.panX ?? 0) + (hasShake ? 8 : 0) },
      { translateY: -2 * (camera?.panY ?? 0) },
      { scale: camera?.zoomLevel ?? 1 },
    ],
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{
        flex: 1,
        backgroundColor: colors['surface-1'] ?? colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {backgroundSource ? (
          <Image
            source={backgroundSource}
            style={[{ position: 'absolute', inset: 0 }, cameraTransform]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : sceneState.backgroundAssetId ? (
          <Text style={{ fontSize: 14, color: colors.muted }}>
            {t('editor.loadingBackground')}
          </Text>
        ) : (
          <Text style={{ fontSize: 14, color: withAlpha(colors.muted, 0.6) }}>{t('editor.noBackground')}</Text>
        )}

        {sceneState.characters.map((char, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              bottom: 220,
              left: getCharacterPosition(char.position),
              width: 80,
              height: 120,
              backgroundColor: withAlpha(secondaryColor, 0.19),
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              ...cameraTransform,
            }}
          >
            <Text style={{ fontSize: 10, color: colors.muted }}>
              {char.characterId}
            </Text>
          </View>
        ))}

        {(sceneState.interactiveObjects?.length ?? 0) > 0 ? (
          <InteractiveObjectsLayer
            objects={sceneState.interactiveObjects ?? []}
            onSceneTransition={(targetSceneId) => router.push({ pathname: '/preview', params: { storyId, sceneId: targetSceneId } })}
            onDialogue={(text) => setDisplayedText(text)}
            onPlayAudio={(audioUri, volume = 1, loop = false) => {
              void audioServiceRef.current.play(`preview-interactive:${Date.now()}`, audioUri, { volume, loop });
            }}
          />
        ) : null}

        {hasFlash ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: '#fff', opacity: 0.28 }} /> : null}
        {hasVignette ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderWidth: 36, borderColor: 'rgba(0,0,0,0.32)' }} /> : null}
      </View>

      {!showChoices && displayedText ? (
        <Pressable
          onPress={handleAdvance}
          style={{
            position: 'absolute',
            bottom: insets.bottom + 20,
            left: 20,
            right: 20,
            backgroundColor: surfaceContainer,
            borderRadius: 12,
            borderTopWidth: 2,
            borderTopColor: colors.primary,
            padding: 16,
          }}
          accessibilityRole="button"
          accessibilityLabel={t('reader.continueReading')}
        >
          <Text style={{ fontSize: 15, color: colors.foreground, lineHeight: 22 }}>
            {displayedText}
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 8, textAlign: 'right' }}>
            {isTyping ? t('reader.tapToSpeedUp') : t('reader.tapToContinue')}
            {!isTyping ? <IconSymbol name="play" size={10} color={colors.muted} /> : null}
          </Text>
        </Pressable>
      ) : null}

      {showChoices && sceneState.currentChoices ? (
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 20,
          left: 20,
          right: 20,
          gap: 8,
        }}>
          {sceneState.currentChoices.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => handleChoiceSelect(opt.id)}
              style={{
                backgroundColor: surfaceContainer,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                alignItems: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel={t('reader.choiceLabel', { text: opt.text || opt.id })}
            >
              <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>
              {opt.text || t('reader.choiceFallback', { id: opt.id })}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {isComplete && (
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 20,
          left: 20,
          right: 20,
        }}>
          <Pressable
            onPress={handleBack}
            style={{
              backgroundColor: surfaceContainer,
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={t('menu.back')}
          >
            <Text style={{ fontSize: 14, color: colors.foreground }}>
              {t('editor.preview.complete')}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={{
        position: 'absolute',
        top: insets.top,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
      }}>
        <Pressable onPress={handleBack} style={{ padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
          <IconSymbol name="arrow.left" size={14} color={colors['text-inverse']} />
          <Text style={{ color: colors['text-inverse'], fontSize: 14 }}>{t('menu.back')}</Text>
        </Pressable>
        <Text style={{ color: colors['text-inverse'], fontSize: 12, alignSelf: 'center' }}>
          {currentStepIndex + 1}/{timeline.length}
        </Text>
      </View>
    </View>
  );
}

function getCharacterPosition(position: string): number {
  switch (position) {
    case 'far-left': return 20;
    case 'left': return 60;
    case 'center': return 140;
    case 'right': return 220;
    case 'far-right': return 280;
    default: return 140;
  }
}
