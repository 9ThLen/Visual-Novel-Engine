/**
 * StoryReaderResponsive — modern visual novel reader.
 *
 * Features:
 *  • Typewriter text effect (configurable speed)
 *  • Fade + slide transitions between scenes
 *  • Auto-play mode (advances after typewriter completes)
 *  • Dialogue history log
 *  • Skip / fast-forward (tap = instant text, hold Skip = turbo)
 *  • Modern VN UI: full-screen bg, gradient overlay, speaker nameplate
 *  • Lazy image loading via expo-image
 *  • Dark / light theme
 *
 * Decomposed into custom hooks:
 *  • useReaderPages — page computation + display choices
 *  • useReaderAssets — character animations + scene images
 *  • useReaderNotifications — transition/complete side effects
 *  • useDialogueHistory — history state management
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/use-colors';
import type { UserSettings } from '@/lib/user-settings';
import type { TimelineStep } from '@/lib/engine/types';
import type { SceneState } from '@/lib/engine/runtime-types';
import type { ReaderTransitionEvent } from '@/lib/reader-runtime';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';
import { getReaderLayout, getResponsiveFontSize } from '@/lib/responsive';
import { DialogueHistory } from './dialogue-history';
import { ReaderControls } from './reader/ReaderControls';
import { ReaderDisplay } from './reader/ReaderDisplay';
import { useTypewriter } from '@/hooks/useTypewriter';
import { useReaderAutoAdvance } from '@/hooks/useReaderAutoAdvance';
import { useI18n } from '@/hooks/use-i18n';
import {
  getStoryReaderContainerStyle,
  getStoryReaderSpeakerTextStyle,
} from '@/lib/story-reader-platform';
import { useReaderPages } from '@/hooks/useReaderPages';
import { useReaderAssets } from '@/hooks/useReaderAssets';
import { useReaderNotifications } from '@/hooks/useReaderNotifications';
import { useDialogueHistory } from '@/hooks/useDialogueHistory';
import { enhancedAudioManager } from '@/lib/audio-manager-enhanced';
import { resolvePlayableAssetUri } from '@/lib/asset-resolver';
import { useAppStore } from '@/stores/use-app-store';

// ── Helpers ────────────────────────────────────────────────────────────────

function extractSpeaker(text: string): { speaker: string | null; body: string } {
  const match = text.match(/^([A-Za-zА-Яа-яҐґЄєІіЇї\u4e00-\u9fff][\w \u00c0-\u024f'.-]{0,30}?)\s*:\s*([\s\S]+)$/);
  if (match) return { speaker: match[1], body: match[2] };
  return { speaker: null, body: text };
}

interface Props {
  sceneId?: string;
  timeline?: TimelineStep[];
  initialVariables?: Record<string, string | number | boolean>;
  onContinue?: (targetSceneId?: string) => void;
  onExecutorChoiceSelect?: (choice: { sceneId: string; choiceId: string; targetSceneId: string | null }) => void;
  onTransition?: (targetSceneId: string | null, transition?: ReaderTransitionEvent) => void;
  /** How to animate into the current scene (set by the host from the previous scene's transition block). */
  entryTransition?: Pick<ReaderTransitionEvent, 'transitionType' | 'durationSec'> | null;
  isLoading?: boolean;
  settings?: Partial<UserSettings>;
  onHistoryVisibleChange?: (visible: boolean) => void;
  onSceneStateChange?: (sceneState: SceneState) => void;
  routeOnExecutorComplete?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StoryReaderResponsive({
  sceneId,
  timeline,
  initialVariables,
  onContinue,
  onExecutorChoiceSelect,
  onTransition,
  entryTransition,
  isLoading = false,
  settings = {},
  onHistoryVisibleChange,
  onSceneStateChange,
  routeOnExecutorComplete = false,
}: Props) {
  const colors = useColors();
  const { t } = useI18n();
  const dims = useWindowDimensions();
  const layout = getReaderLayout(dims);
  const fontSize = getResponsiveFontSize(dims);
  const firstTimelineStepId = timeline?.[0]?.id;
  const currentStoryId = useAppStore((state) => state.currentStoryId);
  const storyIdForCharacters = currentStoryId ?? 'current';
  const characterLibrary = useAppStore((state) =>
    currentStoryId ? state.characterLibraries[currentStoryId] || [] : []
  );

  const { textSpeed = 0.5, textSize = 'medium', autoPlay = false } = settings;

  // ── Executor ──────────────────────────────────────────────────────────
  const executor = useSceneExecutor(timeline ?? [], { initialVariables });
  const usingExecutor = !!timeline && timeline.length > 0;

  const displaySceneId = useMemo(
    () => sceneId ?? `executed-scene:${firstTimelineStepId ?? 'empty'}`,
    [sceneId, firstTimelineStepId],
  );

  // ── Pages + Choices (extracted) ───────────────────────────────────────
  const { pages, displayChoices, hasChoices, displayBackgroundUri } =
    useReaderPages(
      timeline,
      executor.currentStepIndex,
      executor.sceneState.currentChoices,
      executor.sceneState.backgroundAssetId,
    );

  // ── Assets: images + character instances (extracted) ──────────────────
  const { bgSource, resolvedCharUris, characterInstances } =
    useReaderAssets(
      displaySceneId,
      displayBackgroundUri,
      executor.sceneState.characters,
      characterLibrary,
      storyIdForCharacters,
    );

  // ── Page index ────────────────────────────────────────────────────────
  const [pageIndex, setPageIndex] = useState(0);
  const [temporaryDialogue, setTemporaryDialogue] = useState<{ text: string; speaker?: string } | null>(null);

  // ── Typewriter ─────────────────────────────────────────────────────────
  const { displayedText, isTyping, startTypewriter, completeTypewriter } =
    useTypewriter(textSpeed);

  // ── Auto-advance ───────────────────────────────────────────────────────
  const {
    autoPlayActive,
    turbo,
    setTurbo,
    toggleAutoPlay,
    handleTapAdvance: handleTap,
  } = useReaderAutoAdvance({
    isLoading,
    isTyping,
    hasChoices,
    executor,
    completeTypewriter,
    initialAutoPlay: autoPlay,
    pageIndex,
  });

  // ── History (extracted) ───────────────────────────────────────────────
  const { history, showHistory, openHistory, closeHistory } =
    useDialogueHistory({
      isTyping,
      pageIndex,
      displaySceneId,
      pages,
      extractSpeaker,
    });

  // ── Notifications (extracted) ─────────────────────────────────────────
  useReaderNotifications({
    displaySceneId,
    isTransitioning: executor.sceneState.isTransitioning,
    transitionTarget: executor.sceneState.transitionTarget,
    transitionMode: executor.sceneState.transitionMode,
    transitionType: executor.sceneState.transitionType,
    transitionDuration: executor.sceneState.transitionDuration,
    isComplete: executor.isComplete,
    activeEffects: executor.sceneState.activeEffects,
    routeOnExecutorComplete,
    onTransition,
  });

  // ── Callbacks via refs (avoids stale closures) ────────────────────────
  const onHistoryVisibleChangeRef = useRef(onHistoryVisibleChange);
  onHistoryVisibleChangeRef.current = onHistoryVisibleChange;
  const onSceneStateChangeRef = useRef(onSceneStateChange);
  onSceneStateChangeRef.current = onSceneStateChange;

  useEffect(() => {
    onHistoryVisibleChangeRef.current?.(showHistory);
  }, [showHistory]);

  useEffect(() => {
    onSceneStateChangeRef.current?.(executor.sceneState);
  }, [executor.sceneState]);

  // ── Scene change — entry animation (fade / slide / instant) ───────────
  const sceneOpacity = useSharedValue(1);
  const bgScale = useSharedValue(1);
  const bgSlideX = useSharedValue(0);
  const uiOpacity = useSharedValue(1);
  const entryTransitionRef = useRef(entryTransition);
  entryTransitionRef.current = entryTransition;

  useEffect(() => {
    setPageIndex(0);
    const entry = entryTransitionRef.current;
    const type = entry?.transitionType ?? 'fade';
    const durationMs = Math.max(0, Math.round((entry?.durationSec ?? 0.38) * 1000));

    if (type === 'instant' || durationMs === 0) {
      sceneOpacity.value = 1;
      bgScale.value = 1;
      bgSlideX.value = 0;
      return;
    }

    if (type === 'slide') {
      sceneOpacity.value = 0;
      bgScale.value = 1;
      bgSlideX.value = 48;
      sceneOpacity.value = withTiming(1, { duration: durationMs });
      bgSlideX.value = withTiming(0, { duration: durationMs });
      return;
    }

    sceneOpacity.value = 0;
    bgScale.value = 1.04;
    bgSlideX.value = 0;
    sceneOpacity.value = withTiming(1, { duration: durationMs });
    bgScale.value = withTiming(1, { duration: Math.max(durationMs, Math.round(durationMs * 1.8)) });
  }, [displaySceneId, usingExecutor, sceneOpacity, bgScale, bgSlideX]);

  // ── Start typewriter on page change ────────────────────────────────────
  useEffect(() => {
    const { body } = extractSpeaker(pages[pageIndex] ?? '');
    startTypewriter(body);
  }, [pageIndex, pages, startTypewriter]);

  // ── Animated styles ────────────────────────────────────────────────────
  const bgAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value,
    transform: [{ scale: bgScale.value }, { translateX: bgSlideX.value }],
  }));

  const charactersAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value * uiOpacity.value,
  }));

  const dialogueAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value * uiOpacity.value,
  }));

  // ── Speaker + font size ────────────────────────────────────────────────
  const dialogueFontSize =
    textSize === 'small' ? fontSize.sm :
    textSize === 'large' ? fontSize.lg :
    fontSize.md;

  const { speaker } = extractSpeaker(pages[pageIndex] ?? '');
  const displaySpeaker = temporaryDialogue?.speaker ?? speaker;
  const displayText = temporaryDialogue?.text ?? displayedText;
  const handleDisplayTap = () => {
    if (temporaryDialogue) {
      setTemporaryDialogue(null);
      return;
    }
    handleTap();
  };

  // ── Choice selection ───────────────────────────────────────────────────
  const handleSelectChoice = (choiceId: string) => {
    const choice = displayChoices.find((item) => item.id === choiceId);
    executor.selectChoice(choiceId);
    if (!choice) return;
    onExecutorChoiceSelect?.({
      sceneId: displaySceneId,
      choiceId,
      targetSceneId: choice.targetSceneId,
    });
  };

  // ── Reader controls ────────────────────────────────────────────────────
  const readerControls = (
    <ReaderControls
      autoPlayActive={autoPlayActive}
      canAdvance={executor.canAdvance}
      colors={colors}
      hasChoices={hasChoices}
      isTyping={isTyping}
      labels={{
        auto: t('reader.auto'),
        log: t('reader.log'),
        openHistory: t('reader.openHistory'),
        skip: t('reader.skip'),
        skipText: t('reader.skipText'),
        startAuto: t('reader.startAuto'),
        stopAuto: t('reader.stopAuto'),
        tapToContinue: t('reader.tapToContinue'),
      }}
      onOpenHistory={openHistory}
      onSetTurbo={setTurbo}
      onToggleAutoPlay={toggleAutoPlay}
      turbo={turbo}
    />
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <View className="flex-1" style={getStoryReaderContainerStyle(colors)}>
      <ReaderDisplay
        backgroundAnimatedStyle={bgAnimatedStyle}
        bgSource={bgSource}
        characterAnimatedStyle={charactersAnimatedStyle}
        choices={displayChoices}
        colors={colors}
        dialogueAnimatedStyle={dialogueAnimatedStyle}
        dialogueFontSize={dialogueFontSize}
        displayedText={displayText}
        fallbackColor={colors.background}
        getChoiceAccessibilityLabel={(text) => t('reader.choiceLabel', { text })}
        continueAccessibilityLabel={t('reader.continueReading')}
        continueAccessibilityHint={t('reader.continueHint')}
        isTyping={isTyping}
        isLoading={isLoading}
        onTap={handleDisplayTap}
        onSelectChoice={handleSelectChoice}
        paddingBottom={layout.dialoguePosition === 'bottom' ? layout.dialogueHeight - 20 : 0}
        pagesLength={pages.length}
        pageIndex={pageIndex}
        readerControls={readerControls}
        resolvedCharUris={resolvedCharUris}
        speaker={displaySpeaker}
        speakerTextStyle={getStoryReaderSpeakerTextStyle(colors)}
        instances={characterInstances}
        activeSpeakerCharacterId={executor.sceneState.activeSpeakerCharacterId ?? null}
        activeSpeakerFocusScale={executor.sceneState.activeSpeakerFocusScale}
        dimNonSpeakerCharacters={executor.sceneState.dimNonSpeakerCharacters}
        activeEffects={executor.sceneState.activeEffects}
        cameraState={executor.sceneState.cameraState}
        interactiveObjects={executor.sceneState.interactiveObjects}
        onInteractiveDialogue={(text, actionSpeaker) => setTemporaryDialogue({ text, speaker: actionSpeaker })}
        onInteractiveSceneTransition={(targetSceneId) => onTransition?.(targetSceneId)}
        onInteractivePlayAudio={(audioUri, volume = settings.sfxVolume ?? 1, loop = false) => {
          void resolvePlayableAssetUri(audioUri).then((uri) => {
            if (!uri) return;
            void enhancedAudioManager.play(`interactive:${audioUri}:${Date.now()}`, uri, { volume, loop });
          });
        }}
      />

      <DialogueHistory
        visible={showHistory}
        entries={history}
        onClose={closeHistory}
      />
    </View>
  );
}
