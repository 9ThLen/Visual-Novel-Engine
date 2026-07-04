import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { selectCanonicalSceneRecord, useAppStore } from '@/stores/use-app-store';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { AudioPlayerService } from '@/lib/audio-player-service';
import { useI18n } from '@/hooks/use-i18n';
import { getTimelineDisplayPages } from '@/lib/reader-runtime';
import { withAlpha } from '@/lib/_core/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';
import { CharacterDisplay } from '@/components/CharacterDisplay';
import { useReaderAssets } from '@/hooks/useReaderAssets';
import { EffectsLayerStack, effectsForCharacter, effectsForTarget } from '@/components/reader/EffectsLayerStack';
import { useShakeOffset } from '@/components/reader/useShakeOffset';
import { useVisibleEffects } from '@/components/reader/useVisibleEffects';
import { useEffectAmbience } from '@/hooks/useEffectAmbience';

export function PreviewScreen({ storyId, sceneId }: { storyId: string; sceneId: string }) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const sceneRecord = useAppStore(selectCanonicalSceneRecord(storyId, sceneId));
  const characterLibrary = useAppStore((s) => s.characterLibraries[storyId] || []);
  const sfxVolume = useAppStore((s) => s.settings.sfxVolume);

  const timeline = useMemo(
    () => sceneRecord?.timeline ?? [],
    [sceneRecord]
  );

  const { sceneState, currentStepIndex, isComplete, isTyping, advance, selectChoice } =
    useSceneExecutor(timeline);

  useEffectAmbience(sceneState.activeEffects, sfxVolume);

  const [displayedText, setDisplayedText] = useState('');
  const [audioService] = useState(() => new AudioPlayerService());
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
      void audioService.stop('preview-bgm', sceneState.musicFadeDuration ?? 300);
      prevMusicTrackRef.current = null;
      return;
    }
    if (sceneState.musicAction === 'pause') {
      void audioService.pause('preview-bgm');
      return;
    }
    if (currentTrack && currentTrack !== prevMusicTrackRef.current) {
      void audioService.play('preview-bgm', currentTrack, {
        volume: typeof sceneState.musicVolume === 'number' ? sceneState.musicVolume : 0.8,
        loop: sceneState.musicLoop ?? true,
        fadeIn: sceneState.musicFadeDuration,
      });
    } else if (!currentTrack && prevMusicTrackRef.current) {
      void audioService.stop('preview-bgm', 300);
    }
    prevMusicTrackRef.current = currentTrack;
  }, [audioService, sceneState.musicAction, sceneState.musicFadeDuration, sceneState.musicLoop, sceneState.musicTrackId, sceneState.musicVolume]);

  useEffect(() => {
    for (const event of sceneState.soundEvents ?? []) {
      if (!event.assetId || playedSoundEventsRef.current.has(event.id)) continue;
      playedSoundEventsRef.current.add(event.id);
      if (event.action === 'stop') {
        void audioService.stop(`preview-sfx:${event.assetId}`, 100);
        continue;
      }
      const channelId = event.loop ? `preview-sfx:${event.assetId}` : `preview-sfx:${event.id}`;
      void audioService.play(channelId, event.assetId, {
        volume: event.volume,
        loop: event.loop,
      });
    }
  }, [audioService, sceneState.soundEvents]);

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
    return () => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
      void audioService.cleanup();
    };
  }, [audioService]);

  const handleAdvance = useCallback(() => {
    advance();
  }, [advance]);

  const handleChoiceSelect = useCallback((optionId: string) => {
    selectChoice(optionId);
  }, [selectChoice]);

  const handleBack = useCallback(() => {
    void audioService.cleanup();
    router.back();
  }, [audioService, router]);

const surfaceContainer = colors['surface-container'] || colors.surface;
  const showChoices = !!sceneState.currentChoices;
  const camera = sceneState.cameraState;
  const activeEffects = useVisibleEffects(sceneState.activeEffects);
  const screenEffects = effectsForTarget(activeEffects, 'screen');
  const backgroundEffects = effectsForTarget(activeEffects, 'background');
  const characterEffects = effectsForTarget(activeEffects, 'character');
  const genericCharacterEffects = characterEffects.filter((effect) => !effect.characterId);
  const shakeOffset = useShakeOffset(screenEffects);
  const cameraTransform = {
    transform: [
      { translateX: -2 * (camera?.panX ?? 0) + shakeOffset.x },
      { translateY: -2 * (camera?.panY ?? 0) + shakeOffset.y },
      { scale: camera?.zoomLevel ?? 1 },
    ],
  };
  const { resolvedCharUris, characterInstances } = useReaderAssets(
    sceneId,
    null,
    sceneState.characters,
    characterLibrary,
    storyId,
  );

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
            style={[StyleSheet.absoluteFillObject, cameraTransform]}
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

        {backgroundEffects.length > 0 ? (
          <EffectsLayerStack effects={backgroundEffects} colors={colors} target="background" />
        ) : null}

        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, cameraTransform]}>
          {characterInstances.map((instance) => {
            const characterSpecificEffects = effectsForCharacter(characterEffects, instance.characterId);
            return (
              <CharacterDisplay
                key={instance.characterId}
                instance={instance}
                spriteUri={getImageSourceUri(resolvedCharUris[instance.characterId])}
                position={instance.position}
                isActiveSpeaker={sceneState.activeSpeakerCharacterId === instance.characterId}
                dimmed={
                  sceneState.dimNonSpeakerCharacters === true
                  && sceneState.activeSpeakerCharacterId !== instance.characterId
                }
                focusScale={sceneState.activeSpeakerFocusScale}
                overlay={characterSpecificEffects.length > 0 ? (
                  <EffectsLayerStack effects={characterSpecificEffects} colors={colors} target="character" />
                ) : null}
              />
            );
          })}
        </View>
        {genericCharacterEffects.length > 0 ? (
          <EffectsLayerStack effects={genericCharacterEffects} colors={colors} target="character" />
        ) : null}

        {(sceneState.interactiveObjects?.length ?? 0) > 0 ? (
          <InteractiveObjectsLayer
            objects={sceneState.interactiveObjects ?? []}
            onSceneTransition={(targetSceneId) => router.push({ pathname: '/preview', params: { storyId, sceneId: targetSceneId } })}
            onDialogue={(text) => setDisplayedText(text)}
            onPlayAudio={(audioUri, volume = 1, loop = false) => {
              void audioService.play(`preview-interactive:${Date.now()}`, audioUri, { volume, loop });
            }}
          />
        ) : null}

        {screenEffects.length > 0 ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { zIndex: 30, elevation: 30 }]}>
            <EffectsLayerStack effects={screenEffects} colors={colors} target="screen" />
          </View>
        ) : null}
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

function getImageSourceUri(source: number | string | { uri: string } | undefined): string {
  if (!source || typeof source === 'number') return '';
  return typeof source === 'string' ? source : source.uri;
}
