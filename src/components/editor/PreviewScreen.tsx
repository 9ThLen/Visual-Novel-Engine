import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, Pressable, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { selectCanonicalSceneRecord, selectSceneRecordMapForStory, useAppStore } from '@/stores/use-app-store';
import { createEmptySceneState } from '@/lib/engine/conditionUtils';
import type { RuntimeVariables, SceneState } from '@/lib/engine/runtime-types';
import type { TimelineStep } from '@/lib/engine/types';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { AudioPlayerService } from '@/lib/audio-player-service';
import { useI18n } from '@/hooks/use-i18n';
import { getNextSceneId, getTimelineDisplayPages, type ReaderTransitionEvent } from '@/lib/reader-runtime';
import { resolveScenePresentation, sceneComicCapabilities } from '@/lib/comic/comic-presentation';
import { withAlpha } from '@/lib/_core/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PreviewInspector } from '@/components/editor/PreviewInspector';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';
import { CharacterDisplay } from '@/components/CharacterDisplay';
import { ComicReader } from '@/components/comic/ComicReader';
import { ComicReadingSession } from '@/components/comic/ComicReadingSession';
import { SceneRuntimeHost, useSceneRuntime } from '@/components/reader/SceneRuntimeHost';
import { useReaderAssets } from '@/hooks/useReaderAssets';
import { EffectsLayerStack, effectsForCharacter, effectsForTarget } from '@/components/reader/EffectsLayerStack';
import { useCameraTransform } from '@/components/reader/useCameraTransform';
import { useShakeOffset } from '@/components/reader/useShakeOffset';
import { useVisibleEffects } from '@/components/reader/useVisibleEffects';
import { useEffectAmbience } from '@/hooks/useEffectAmbience';
import { SceneVideoLayer } from '@/components/reader/SceneVideoLayer';
import { DevicePreviewSwitch } from '@/components/document-editor/inspector/ScenePreviewCard';
import { useEditorPreviewDevice } from '@/components/document-editor/inspector/useEditorPreviewDevice';
import { getPreviewGeometry, getPreviewLayerStyle, type PreviewGeometry } from '@/lib/document-editor/preview-viewport';
import { showToast } from '@/lib/toast-store';

function secondsToMs(value: number | null | undefined, fallbackMs = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallbackMs;
  return Math.max(0, Math.round(value * 1000));
}

/** What the screen around the device shows of the run inside it: the inspector, the step count, the sound. */
interface RunReport {
  sceneState: SceneState;
  timeline: TimelineStep[];
  currentStepIndex: number;
  isTyping: boolean;
  isComplete: boolean;
}

/** The scene on screen and how the preview came to it. */
interface PreviewVisit {
  /** A new visit, even of the same scene, is a new run. */
  count: number;
  sceneId: string;
  /** The variables the scene was entered with. */
  variables?: RuntimeVariables;
  transition: ReaderTransitionEvent | null;
}

/**
 * The editor's full-screen preview. The scene runs in a SceneRuntimeHost and is
 * shown as the reader would show it: a scene set to always be a comic, with
 * nothing in it a comic page cannot show, is read as one, and goes on to the
 * next scene as the reader's does, so comic scenes read one after another make
 * one strip. Any other scene is drawn as the novel.
 */
export function PreviewScreen({ storyId, sceneId }: { storyId: string; sceneId: string }) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [device, setDevice] = useEditorPreviewDevice();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const geometry = getPreviewGeometry(device, stage);
  const [visit, setVisit] = useState<PreviewVisit>({ count: 0, sceneId, transition: null });
  const [ended, setEnded] = useState(false);
  const sceneRecord = useAppStore(selectCanonicalSceneRecord(storyId, visit.sceneId));
  const settings = useAppStore((s) => s.settings);
  const sfxVolume = settings.sfxVolume;

  const timeline = useMemo(
    () => sceneRecord?.timeline ?? [],
    [sceneRecord]
  );

  // As in the reader: the story's reading format comes with stage 4, so for
  // now only the scene's own setting makes it a comic.
  const readsAsComic = useMemo(
    () => resolveScenePresentation(undefined, null, sceneRecord?.comic, sceneComicCapabilities(timeline)).readAs === 'comic',
    [sceneRecord?.comic, timeline],
  );

  const [run, setRun] = useState<RunReport>(() => ({
    sceneState: createEmptySceneState(),
    timeline: [],
    currentStepIndex: 0,
    isTyping: false,
    isComplete: false,
  }));
  const { sceneState } = run;
  // Set with the report, before the run's own effects ask to move on.
  const variablesRef = useRef<RuntimeVariables | undefined>(undefined);
  const handleReport = useCallback((report: RunReport) => {
    variablesRef.current = report.sceneState.variables;
    setRun(report);
  }, []);

  useEffectAmbience(sceneState.activeEffects, sfxVolume);

  const [audioService] = useState(() => new AudioPlayerService());
  const playedSoundEventsRef = useRef<Set<string>>(new Set());
  const prevMusicTrackRef = useRef<string | null>(null);
  const prevMusicBoundToRef = useRef<'scene' | 'continuous'>('continuous');
  const prevMusicFadeOutMsRef = useRef(800);
  const previewAutoFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPreviewAutoFadeTimer = useCallback(() => {
    if (previewAutoFadeTimerRef.current) {
      clearTimeout(previewAutoFadeTimerRef.current);
      previewAutoFadeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearPreviewAutoFadeTimer();
    const currentTrack = sceneState.musicTrackId;
    const fadeInMs = secondsToMs(sceneState.musicFadeIn, 800);
    const fadeOutMs = secondsToMs(sceneState.musicFadeOut, 800);
    const scheduleAutoFade = () => {
      if (sceneState.musicMode !== 'track' || !sceneState.musicAutoFadeAfter || sceneState.musicAutoFadeAfter <= 0) {
        return;
      }
      previewAutoFadeTimerRef.current = setTimeout(() => {
        void audioService.stop('preview-bgm', fadeOutMs);
        prevMusicTrackRef.current = null;
      }, secondsToMs(sceneState.musicAutoFadeAfter));
    };

    if (sceneState.musicMode === 'silence') {
      void audioService.stop('preview-bgm', fadeOutMs);
      prevMusicTrackRef.current = null;
      prevMusicBoundToRef.current = 'continuous';
      return;
    }
    if (currentTrack && currentTrack !== prevMusicTrackRef.current) {
      void audioService.crossFade('preview-bgm', currentTrack, {
        volume: typeof sceneState.musicVolume === 'number' ? sceneState.musicVolume : 0.8,
        loop: sceneState.musicLoop ?? true,
        fadeInMs,
        fadeOutMs,
      });
      prevMusicTrackRef.current = currentTrack;
      prevMusicBoundToRef.current = sceneState.musicBoundTo ?? 'continuous';
      prevMusicFadeOutMsRef.current = fadeOutMs;
      scheduleAutoFade();
      return;
    }
    if (currentTrack && currentTrack === prevMusicTrackRef.current) {
      void audioService.setVolume('preview-bgm', typeof sceneState.musicVolume === 'number' ? sceneState.musicVolume : 0.8);
      prevMusicBoundToRef.current = sceneState.musicBoundTo ?? 'continuous';
      prevMusicFadeOutMsRef.current = fadeOutMs;
      scheduleAutoFade();
      return;
    }
    if (
      !currentTrack &&
      sceneState.musicMode === null &&
      prevMusicTrackRef.current &&
      prevMusicBoundToRef.current === 'scene'
    ) {
      void audioService.stop('preview-bgm', prevMusicFadeOutMsRef.current);
      prevMusicTrackRef.current = null;
      prevMusicBoundToRef.current = 'continuous';
    }
  }, [
    audioService,
    clearPreviewAutoFadeTimer,
    sceneState.musicAutoFadeAfter,
    sceneState.musicBoundTo,
    sceneState.musicFadeIn,
    sceneState.musicFadeOut,
    sceneState.musicLoop,
    sceneState.musicMode,
    sceneState.musicTrackId,
    sceneState.musicVolume,
  ]);

  useEffect(() => {
    for (const event of sceneState.soundEvents ?? []) {
      if (!event.assetId || playedSoundEventsRef.current.has(event.id)) continue;
      playedSoundEventsRef.current.add(event.id);
      if (event.mode === 'silence') {
        void audioService.stop(`preview-sfx:${event.assetId}`, secondsToMs(event.fadeOut));
        continue;
      }
      const channelId = event.loop ? `preview-sfx:${event.assetId}` : `preview-sfx:${event.id}`;
      void audioService.play(channelId, event.assetId, {
        volume: event.volume,
        loop: event.loop,
        fadeIn: secondsToMs(event.fadeIn),
      });
    }
  }, [audioService, sceneState.soundEvents]);

  useEffect(() => {
    playedSoundEventsRef.current.clear();
  }, [visit.sceneId]);

  useEffect(() => {
    return () => {
      clearPreviewAutoFadeTimer();
      void audioService.cleanup();
    };
  }, [audioService, clearPreviewAutoFadeTimer]);

  // A comic scene moves on as the reader's does: to the scene its transition
  // or choice names, else along its "next" connection. Where the story would
  // end, so does the preview.
  //
  // A visit moves on once. A choice that is the scene's last step leaves the
  // run both on its way to the scene it names and out of steps, and the second
  // notice would follow the "next" connection, or end the preview, over the first.
  const movedOnRef = useRef<number | null>(null);
  const handleTransition = useCallback((targetSceneId: string | null, transition?: ReaderTransitionEvent) => {
    if (movedOnRef.current === visit.count) return;
    movedOnRef.current = visit.count;
    const nextSceneId = getNextSceneId(
      selectSceneRecordMapForStory(storyId)(useAppStore.getState()),
      visit.sceneId,
      targetSceneId,
      transition?.mode ?? (targetSceneId ? 'scene' : 'end'),
    );
    if (!nextSceneId) {
      setEnded(true);
      return;
    }
    setVisit((current) => ({
      count: current.count + 1,
      sceneId: nextSceneId,
      variables: variablesRef.current,
      transition: transition ?? null,
    }));
  }, [storyId, visit.count, visit.sceneId]);

  const handleBack = useCallback(() => {
    void audioService.cleanup();
    router.back();
  }, [audioService, router]);

  const surfaceContainer = colors['surface-container'] || colors.surface;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* paddingRight keeps the row clear of PreviewInspector's floating toggle. */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingLeft: 16,
        paddingRight: 64,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <Pressable testID="full-preview-back" onPress={handleBack} style={{ padding: 8, borderRadius: 8, backgroundColor: surfaceContainer, flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
          <IconSymbol name="arrow.left" size={14} color={colors.foreground} />
          <Text style={{ color: colors.foreground, fontSize: 14 }}>{t('menu.back')}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <DevicePreviewSwitch colors={colors} device={device} onSelect={setDevice} />
        </View>
      </View>
      <View
        testID="full-preview-stage"
        onLayout={({ nativeEvent }) => setStage({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}
        style={{ flex: 1, overflow: 'hidden', marginBottom: insets.bottom }}
      >
      <View testID="full-preview-device" style={[getPreviewLayerStyle(geometry), { overflow: 'hidden', backgroundColor: colors.background }]}>
        {/* The reader's arrangement: the strip outlives each scene's run. */}
        <ComicReadingSession active={readsAsComic} storyId={storyId} settings={settings} entryTransition={visit.transition}>
          <SceneRuntimeHost key={visit.count} timeline={timeline} initialVariables={visit.variables}>
            <ReportRun onReport={handleReport} />
            {readsAsComic ? (
              <ComicReader sceneId={visit.sceneId} onTransition={handleTransition} routeOnExecutorComplete />
            ) : (
              <PreviewNovelStage storyId={storyId} sceneId={visit.sceneId} geometry={geometry} audioService={audioService} />
            )}
          </SceneRuntimeHost>
        </ComicReadingSession>

        {ended || (!readsAsComic && run.isComplete) ? (
          <View style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            zIndex: 4,
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
        ) : null}

        <Text style={{ position: 'absolute', top: 8, right: 8, zIndex: 4, color: colors.foreground, backgroundColor: surfaceContainer, padding: 8, borderRadius: 8, fontSize: 12 }}>
          {run.currentStepIndex + 1}/{run.timeline.length}
        </Text>
      </View>
      </View>

      <PreviewInspector
        sceneState={sceneState}
        timeline={run.timeline}
        currentStepIndex={run.currentStepIndex}
        isTyping={run.isTyping}
        isComplete={run.isComplete}
      />
    </View>
  );
}

/** Hands the run's state up to the screen around the device, before it paints. */
function ReportRun({ onReport }: { onReport: (report: RunReport) => void }) {
  const { sceneState, timeline, currentStepIndex, isTyping, isComplete } = useSceneRuntime();
  useLayoutEffect(() => {
    onReport({ sceneState, timeline, currentStepIndex, isTyping, isComplete });
  }, [currentStepIndex, isComplete, isTyping, onReport, sceneState, timeline]);
  return null;
}

/** The run drawn as the novel. */
function PreviewNovelStage({
  storyId,
  sceneId,
  geometry,
  audioService,
}: {
  storyId: string;
  sceneId: string;
  geometry: PreviewGeometry;
  audioService: AudioPlayerService;
}) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const characterLibrary = useAppStore((s) => s.characterLibraries[storyId] || []);
  const { timeline, sceneState, currentStepIndex, isTyping, advance, selectChoice } = useSceneRuntime();

  const [displayedText, setDisplayedText] = useState('');
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    };
  }, []);

  const handleAdvance = useCallback(() => {
    advance();
  }, [advance]);

  const handleChoiceSelect = useCallback((optionId: string) => {
    selectChoice(optionId);
  }, [selectChoice]);

  // A failed clip leaves a black frame with no explanation; in the editor the
  // author is the one who can fix it, so say what happened.
  const activeVideoAssetId = sceneState.activeVideo?.assetId;
  const handleVideoPlaybackError = useCallback(() => {
    showToast(t('editor.videoPlaybackFailed').replace('{name}', activeVideoAssetId ?? ''), 'error');
  }, [activeVideoAssetId, t]);

  const surfaceContainer = colors['surface-container'] || colors.surface;
  const showChoices = !!sceneState.currentChoices;
  const camera = sceneState.cameraState;
  const activeEffects = useVisibleEffects(sceneState.activeEffects);
  const screenEffects = effectsForTarget(activeEffects, 'screen');
  const backgroundEffects = effectsForTarget(activeEffects, 'background');
  const characterEffects = effectsForTarget(activeEffects, 'character');
  const genericCharacterEffects = characterEffects.filter((effect) => !effect.characterId);
  const shakeOffset = useShakeOffset(screenEffects);
  // Preview and reader share the camera hook so a preset previewed here moves
  // exactly the way it will for the reader.
  const previewWidth = geometry.deviceWidth;
  // Sprites are sized against the layer they are actually drawn in, inside the
  // device frame. The frame itself is the fallback until the layer reports its
  // own size.
  const [spriteStage, setSpriteStage] = useState<{ width: number; height: number } | null>(null);
  const handleStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setSpriteStage((current) => (current && current.width === width && current.height === height
      ? current
      : { width, height }));
  }, []);
  const cameraValues = useCameraTransform(camera, sceneState.characters, previewWidth);
  const cameraTransform = {
    transform: [
      { translateX: cameraValues.translateX + shakeOffset.x },
      { translateY: cameraValues.translateY + shakeOffset.y },
      { scale: cameraValues.scale },
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
    <>
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

        {sceneState.activeVideo ? (
          <SceneVideoLayer
            key={sceneState.activeVideo.stepId}
            video={sceneState.activeVideo}
            style={cameraTransform}
            onPlaybackError={handleVideoPlaybackError}
          />
        ) : null}

        {backgroundEffects.length > 0 ? (
          <EffectsLayerStack effects={backgroundEffects} colors={colors} target="background" />
        ) : null}

        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, cameraTransform]}
          onLayout={handleStageLayout}
        >
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
                stageWidth={spriteStage?.width ?? geometry.deviceWidth}
                stageHeight={spriteStage?.height ?? geometry.deviceHeight}
                characterCount={characterInstances.length}
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
            bottom: 20,
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
          bottom: 20,
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
    </>
  );
}

function getImageSourceUri(source: number | string | { uri: string } | undefined): string {
  if (!source || typeof source === 'number') return '';
  return typeof source === 'string' ? source : source.uri;
}
