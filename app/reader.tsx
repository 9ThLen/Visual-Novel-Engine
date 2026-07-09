import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { StoryReaderResponsive } from '@/components/story-reader-responsive';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';
import { ReaderMenu } from '@/components/ReaderMenu';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { RuntimeVariables, SceneState } from '@/lib/engine/runtime-types';
import { enhancedAudioManager as audioManager } from '@/lib/audio-manager-enhanced';
import { resolvePlayableAssetUri } from '@/lib/asset-resolver';
import { useReaderAudio, stopReaderPlayback } from '@/hooks/useReaderAudio';
import { useReaderInitialization } from '@/hooks/useReaderInitialization';
import { buttonFeedback } from '@/lib/ui-feedback';
import { parseResumeExisting } from '@/lib/reader-launch';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { buildNextPlaybackState, getTimelineInteractiveObjects, normalizeRuntimeVariables, type ReaderTransitionEvent } from '@/lib/reader-runtime';
import { normalizeUserSettings } from '@/lib/user-settings';
import { createInMemorySceneAccess } from '@/lib/scene-access';
import { getReaderSceneRecordForNavigation } from '@/lib/reader-scene-cache';
import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  incrementChoiceCount,
  loadCoverage,
  recordChoiceTaken,
  recordSceneVisit,
  saveCoverage,
  type StoryCoverage,
} from '@/lib/story-coverage';
import { useAppStore } from '@/stores/use-app-store';

function findChoiceStepIdForOption(sceneRecord: { timeline?: { id: string; blockType: string; enabled?: boolean; data: unknown }[] } | null | undefined, optionId: string): string | null {
  for (const step of sceneRecord?.timeline ?? []) {
    if (step.enabled === false || step.blockType !== 'choice') continue;
    const options = (step.data as { options?: { id: string }[] }).options ?? [];
    if (options.some((option) => option.id === optionId)) return step.id;
  }
  return null;
}

function useReaderRouteParams(): { storyId: string | null; resumeExisting: boolean } {
  const { storyId, resume } = useLocalSearchParams();
  return {
    storyId: Array.isArray(storyId) ? storyId[0] : storyId ?? null,
    resumeExisting: parseResumeExisting(resume),
  };
}

export default function ReaderScreen() {
  const router = useRouter();
  const colors = useColors();
  const { storyId, resumeExisting } = useReaderRouteParams();
  const settings = useAppStore((s) => normalizeUserSettings(s.settings));
  const hydrateReaderSceneWindow = useAppStore((s) => s.hydrateReaderSceneWindow);
  const [showMenu, setShowMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [readerSceneState, setReaderSceneState] = useState<SceneState | null>(null);
  const [entryTransition, setEntryTransition] = useState<ReaderTransitionEvent | null>(null);
  const [objDialogue, setObjDialogue] = useState<{ text: string; speaker?: string } | null>(null);
  const pendingChoiceRef = useRef<{ sceneId: string; choiceId: string; stepId: string | null; targetSceneId: string | null } | null>(null);
  const latestVariablesRef = useRef<RuntimeVariables>({});
  const coverageStorageRef = useRef<ReturnType<typeof createPersistentStorage> | null>(null);
  if (!coverageStorageRef.current) coverageStorageRef.current = createPersistentStorage();
  const coverageStoryIdRef = useRef<string | null>(null);
  const coverageCacheRef = useRef<StoryCoverage | null>(null);
  const coverageLoadRef = useRef<Promise<StoryCoverage> | null>(null);
  const coverageSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const coverageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverageMutationsRef = useRef<((coverage: StoryCoverage) => StoryCoverage)[]>([]);
  const lastRecordedSceneRef = useRef<string | null>(null);
  const { t } = useI18n();

  const { isLoading, sceneRecord, timeline, story, playbackState, updatePlaybackState } = useReaderInitialization(
    storyId ?? undefined,
    { resumeExisting },
  );
  const interactiveObjects = React.useMemo(
    () => getTimelineInteractiveObjects(timeline),
    [timeline],
  );

  useReaderAudio(story?.id ?? storyId ?? undefined, sceneRecord, settings, {
    sceneState: readerSceneState,
    blockedByOverlay: showMenu || historyOpen,
  });

  useEffect(() => {
    latestVariablesRef.current = normalizeRuntimeVariables(playbackState?.variables);
  }, [playbackState?.storyId, playbackState?.currentSceneId, playbackState?.variables]);

  const enqueueCoverageUpdate = useCallback((
    storyIdForCoverage: string,
    mutation: (coverage: StoryCoverage) => StoryCoverage,
  ) => {
    if (coverageStoryIdRef.current !== storyIdForCoverage) {
      coverageStoryIdRef.current = storyIdForCoverage;
      coverageCacheRef.current = null;
      coverageLoadRef.current = null;
      coverageMutationsRef.current = [];
      lastRecordedSceneRef.current = null;
      if (coverageTimerRef.current) {
        clearTimeout(coverageTimerRef.current);
        coverageTimerRef.current = null;
      }
    }

    coverageMutationsRef.current.push(mutation);
    if (coverageTimerRef.current) return;

    coverageTimerRef.current = setTimeout(() => {
      coverageTimerRef.current = null;
      const mutations = coverageMutationsRef.current.splice(0);
      if (mutations.length === 0) return;

      coverageSaveChainRef.current = coverageSaveChainRef.current.then(async () => {
        const storage = coverageStorageRef.current!;
        const loaded = coverageCacheRef.current
          ?? await (coverageLoadRef.current ??= loadCoverage(storage, storyIdForCoverage));
        const next = mutations.reduce((current, apply) => apply(current), loaded);
        coverageCacheRef.current = next;
        await saveCoverage(storage, storyIdForCoverage, next);
      }).catch(() => {});
    }, 0);
  }, []);

  const recordCoverageCommit = useCallback((
    storyIdForCoverage: string,
    sceneId: string | null,
    choice?: { sceneId: string; stepId: string | null; optionId: string } | null,
  ) => {
    if (sceneId) lastRecordedSceneRef.current = sceneId;
    enqueueCoverageUpdate(storyIdForCoverage, (coverage) => {
      let next = coverage;
      if (sceneId) next = recordSceneVisit(next, sceneId);
      if (choice?.stepId) {
        next = recordChoiceTaken(next, choice.sceneId, choice.stepId, choice.optionId);
        next = incrementChoiceCount(next, choice.sceneId, choice.stepId, choice.optionId);
      }
      return next;
    });
  }, [enqueueCoverageUpdate]);

  useEffect(() => {
    if (!story?.id || !playbackState?.currentSceneId) return;
    if (lastRecordedSceneRef.current === playbackState.currentSceneId) return;
    recordCoverageCommit(story.id, playbackState.currentSceneId);
  }, [story?.id, playbackState?.currentSceneId, recordCoverageCommit]);

  const handleSceneStateChange = useCallback((sceneState: SceneState) => {
    latestVariablesRef.current = normalizeRuntimeVariables(sceneState.variables);
    setReaderSceneState(sceneState);
  }, []);

  useEffect(() => {
    setObjDialogue(null);
    setReaderSceneState(null);
  }, [playbackState?.currentSceneId]);

  const finishStory = useCallback((choicesMade: { sceneId: string; choiceId: string }[]) => {
    if (!playbackState) return;
    updatePlaybackState({
      ...playbackState,
      isPlaying: false,
      choicesMade,
      variables: normalizeRuntimeVariables(latestVariablesRef.current),
    });
    void stopReaderPlayback(audioManager);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/tabs');
    }
  }, [playbackState, router, updatePlaybackState]);

  const navigateToScene = useCallback(async (
    sceneId: string,
    choicesMade?: { sceneId: string; choiceId: string }[],
    beforeCommit?: () => void,
    coverageChoice?: { sceneId: string; stepId: string | null; optionId: string } | null,
  ): Promise<boolean> => {
    if (!story || !playbackState) return false;
    await hydrateReaderSceneWindow(story.id, sceneId);
    const appState = useAppStore.getState();
    const sceneAccess = createInMemorySceneAccess(appState);
    const targetSceneRecord = getReaderSceneRecordForNavigation(
      sceneAccess,
      story.id,
      playbackState.currentSceneId,
      sceneId,
    );
    if (!targetSceneRecord) {
      if (__DEV__) {
        console.warn('[ReaderScreen] navigateToScene: target scene not found', sceneId);
      }
      return false;
    }
    const updated = buildNextPlaybackState(
      playbackState,
      sceneId,
      choicesMade,
      latestVariablesRef.current,
    );
    beforeCommit?.();
    recordCoverageCommit(story.id, sceneId, coverageChoice);
    updatePlaybackState(updated);
    return true;
  }, [story, playbackState, hydrateReaderSceneWindow, recordCoverageCommit, updatePlaybackState]);

  const handleTransition = (targetSceneId: string | null, transition?: ReaderTransitionEvent) => {
    if (isLoading || !playbackState) return;
    const pendingChoice = pendingChoiceRef.current;
    pendingChoiceRef.current = null;
    const transitionChoice = pendingChoice
      ? { sceneId: pendingChoice.sceneId, choiceId: pendingChoice.choiceId }
      : { sceneId: playbackState.currentSceneId, choiceId: 'transition' };
    const updatedChoices = [...playbackState.choicesMade, transitionChoice];

    // Resolve destination: explicit target wins; mode 'next' follows the
    // scene's next connection; mode 'end' (or nothing to follow) ends the story.
    const mode = transition?.mode ?? (targetSceneId ? 'scene' : 'end');
    let resolvedTarget = mode === 'end' ? null : targetSceneId;
    if (!resolvedTarget && mode === 'next') {
      resolvedTarget = sceneRecord?.connections?.find((connection) => connection.outputPort === 'next')?.targetSceneId ?? null;
    }

    // Record the taken choice without a scene visit. This is used when the story ends
    // here (no target) or when navigation fails before it could commit coverage.
    const recordPendingChoiceOnly = () => {
      if (story?.id && pendingChoice) {
        recordCoverageCommit(story.id, null, {
          sceneId: pendingChoice.sceneId,
          stepId: pendingChoice.stepId,
          optionId: pendingChoice.choiceId,
        });
      }
    };

    if (resolvedTarget) {
      void navigateToScene(
        resolvedTarget,
        updatedChoices,
        () => setEntryTransition(transition ?? null),
        pendingChoice
          ? { sceneId: pendingChoice.sceneId, stepId: pendingChoice.stepId, optionId: pendingChoice.choiceId }
          : null,
      ).then((didNavigate) => {
        if (!didNavigate) {
          // navigateToScene bailed before committing coverage. Record the
          // choice here so a broken target link doesn't drop it from coverage.
          recordPendingChoiceOnly();
          finishStory(updatedChoices);
        }
      });
    } else {
      recordPendingChoiceOnly();
      finishStory(updatedChoices);
    }
  };

  const handleExecutorChoiceSelect = useCallback((choice: { sceneId: string; choiceId: string; targetSceneId: string | null }) => {
    pendingChoiceRef.current = {
      ...choice,
      stepId: findChoiceStepIdForOption(sceneRecord, choice.choiceId),
    };
  }, [sceneRecord]);

  const handleObjectSceneTransition = (sceneId: string) => {
    void navigateToScene(sceneId);
  };

  const handleObjectDialogue = (text: string, speaker?: string) => {
    setObjDialogue({ text, speaker });
  };

  const sfxPoolIndexRef = React.useRef(0);
  const MAX_SFX_TRACKS = 5;

  const handleObjectPlayAudio = (audioUri: string, volume?: number, loop?: boolean) => {
    resolvePlayableAssetUri(audioUri).then((uri) => {
      if (uri) {
        sfxPoolIndexRef.current = (sfxPoolIndexRef.current + 1) % MAX_SFX_TRACKS;
        const trackId = `sfx_object_${sfxPoolIndexRef.current}`;
        audioManager.play(trackId, uri, { volume: volume ?? 0.7, loop: loop ?? false });
      }
    }).catch(() => {});
  };

  if (isLoading || !story || !timeline) {
    const timedOut = !isLoading && (!story || !timeline);
    return (
      <ScreenContainer className="items-center justify-center gap-4">
        <Text style={{ color: colors.foreground, fontSize: 16 }}>
          {timedOut ? t('reader.notFound') : t('reader.loading')}
        </Text>
        {(timedOut || !isLoading) && (
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{t('menu.back')}</Text>
          </Pressable>
        )}
      </ScreenContainer>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ReaderMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
      />

      <Pressable
        style={({ pressed }) => ({
          position: 'absolute',
          top: 48,
          left: 16,
          zIndex: showMenu ? 99 : 50,
          backgroundColor: colors.backdrop,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        })}
        onPress={() => {
          buttonFeedback();
          setShowMenu(!showMenu);
        }}
        accessibilityRole="button"
        accessibilityLabel={showMenu ? t('menu.closeReader') : t('menu.openReader')}
      >
        <IconSymbol name="menu" size={18} color={colors['text-inverse']} />
      </Pressable>

      <StoryReaderResponsive
        key={sceneRecord?.id ?? playbackState!.currentSceneId}
        sceneId={sceneRecord?.id ?? playbackState!.currentSceneId}
        timeline={timeline}
        onTransition={handleTransition}
        entryTransition={entryTransition}
        onExecutorChoiceSelect={handleExecutorChoiceSelect}
        onSceneStateChange={handleSceneStateChange}
        initialVariables={playbackState?.variables ?? latestVariablesRef.current}
        isLoading={isLoading}
        settings={settings}
        onHistoryVisibleChange={setHistoryOpen}
        routeOnExecutorComplete={true}
      />

      {interactiveObjects.length > 0 && (
        <InteractiveObjectsLayer
          objects={interactiveObjects}
          onSceneTransition={handleObjectSceneTransition}
          onDialogue={handleObjectDialogue}
          onPlayAudio={handleObjectPlayAudio}
        />
      )}

      {objDialogue && (
        <Pressable
          style={{
            position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center',
            backgroundColor: colors.backdrop, zIndex: 100,
          }}
          onPress={() => setObjDialogue(null)}
          accessibilityRole="button"
          accessibilityLabel={t('reader.dismissObjectDialogue')}
        >
          <View
            style={{
              backgroundColor: colors.dialogueBg,
              borderRadius: 16, padding: 20, marginHorizontal: 32, maxWidth: 400,
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            {objDialogue.speaker && (
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                {objDialogue.speaker}
              </Text>
            )}
            <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 24 }}>
              {objDialogue.text}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
