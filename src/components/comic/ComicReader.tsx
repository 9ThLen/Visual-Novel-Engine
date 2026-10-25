/**
 * A scene read as a comic page (docs/plans/COMIC-MODE-PLAN.md, sections 5 and
 * 9.3). It shows the run the SceneRuntimeHost above it owns — the same run the
 * novel reader would show — as panels: the plan of what was actually read,
 * from the run's journal, so a step skipped by a condition or a `goto` makes
 * no panel and a step read twice makes two.
 *
 * A tap opens the next panel of the current stop and, once all are open, asks
 * the run for the next stop; its words come up at once, as the comic has no
 * typewriter. Back closes a panel of the current stop, then rolls the run
 * back, landing with every panel of the stop it returns to open, then asks the
 * host for the previous scene — the novel's order. A choice waits at the end
 * of the strip.
 *
 * The scene's panels are its part of the reading session's strip
 * (ComicReadingSession): the session draws the strip, so a comic scene after
 * another continues it. Outside a session the reader brings one of its own.
 *
 * It takes the novel reader's callbacks, so the reader screen can put either
 * one under the same host.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useI18n } from '@/hooks/use-i18n';
import { useReaderNotifications } from '@/hooks/useReaderNotifications';
import { buildExecutedComicPlan } from '@/lib/comic/comic-layout';
import { comicStopsFromJournal, currentStopPanels, openedInStop } from '@/lib/comic/comic-reading';
import type { SceneState } from '@/lib/engine/runtime-types';
import type { SceneComicSettings } from '@/lib/engine/types';
import type { ReaderTransitionEvent } from '@/lib/reader-runtime';
import type { UserSettings } from '@/lib/user-settings';
import { useAppStore } from '@/stores/use-app-store';

import { useSceneRuntime } from '../reader/SceneRuntimeHost';
import { ComicReadingSession, useComicSession, type ComicSession } from './ComicReadingSession';

interface ComicReaderProps {
  sceneId: string;
  /** The scene's comic settings: the author's edits of its panels are drawn with it. */
  comic?: SceneComicSettings;
  settings?: Partial<UserSettings>;
  onTransition?: (targetSceneId: string | null, transition?: ReaderTransitionEvent) => void;
  onExecutorChoiceSelect?: (choice: { sceneId: string; choiceId: string; stepId: string; targetSceneId: string | null }) => void;
  onSceneStateChange?: (sceneState: SceneState) => void;
  routeOnExecutorComplete?: boolean;
  /** True when the host can roll back to a previous scene (see onRollbackScene). */
  canRollbackScene?: boolean;
  /** Called when Back is pressed at the very start of the scene. */
  onRollbackScene?: () => void;
}

export function ComicReader(props: ComicReaderProps) {
  const session = useComicSession();
  const storyId = useAppStore((state) => state.currentStoryId) ?? 'current';
  if (session) return <ComicSceneReader {...props} session={session} />;
  return (
    <ComicReadingSession active storyId={storyId} settings={props.settings}>
      <ComicReader {...props} />
    </ComicReadingSession>
  );
}

function ComicSceneReader({
  session,
  sceneId,
  comic,
  onTransition,
  onExecutorChoiceSelect,
  onSceneStateChange,
  routeOnExecutorComplete = false,
  canRollbackScene = false,
  onRollbackScene,
}: ComicReaderProps & { session: ComicSession }) {
  const { t } = useI18n();
  const runtime = useSceneRuntime();
  const { timeline, journal, sceneState } = runtime;
  // This visit's key in the session's strip.
  const [visit] = useState(() => session.begin());

  const plan = useMemo(
    () => buildExecutedComicPlan(timeline, comicStopsFromJournal(timeline, journal), comic),
    [comic, journal, timeline],
  );
  const current = journal.length ? journal[journal.length - 1] : null;
  const currentId = current ? String(current.executionId) : null;
  const stop = useMemo(() => currentStopPanels(plan, currentId), [currentId, plan]);

  // How many of the current stop's panels are open. A count kept for another
  // stop does not apply: a new stop opens with one panel, a stop landed on by
  // rollback with all of them.
  const [opened, setOpened] = useState<{ id: string | null; count: number }>({ id: null, count: 1 });
  const landOnLastRef = useRef(false);
  const openedNow = openedInStop(stop, opened.id === currentId ? opened.count : landOnLastRef.current ? Infinity : 1);
  const revealed = stop.first + openedNow;

  // The comic sets words at once: a stop that would type its text is told so.
  const { isTyping, advance } = runtime;
  useEffect(() => {
    if (isTyping) advance();
  }, [advance, currentId, isTyping]);

  useEffect(() => {
    onSceneStateChange?.(sceneState);
  }, [onSceneStateChange, sceneState]);

  useReaderNotifications({
    displaySceneId: sceneId,
    isTransitioning: sceneState.isTransitioning,
    transitionTarget: sceneState.transitionTarget,
    transitionMode: sceneState.transitionMode,
    transitionType: sceneState.transitionType,
    transitionDuration: sceneState.transitionDuration,
    isComplete: timeline.length > 0 && runtime.isComplete,
    activeEffects: sceneState.activeEffects,
    routeOnExecutorComplete,
    onTransition,
  });

  const choices = useMemo(() => {
    if (!current || current.blockType !== 'choice' || !current.snapshot.currentChoices) return null;
    return {
      options: current.snapshot.currentChoices.map((option) => ({ id: option.id, text: option.text })),
      chosenId: current.chosenOptionId ?? null,
    };
  }, [current]);

  const handleTap = useCallback(() => {
    if (runtime.isTyping) {
      runtime.advance();
      return;
    }
    if (openedNow < stop.count) {
      setOpened({ id: currentId, count: openedNow + 1 });
      return;
    }
    if (choices) return;
    landOnLastRef.current = false;
    runtime.advance();
  }, [choices, currentId, openedNow, runtime, stop.count]);

  const handleChoose = useCallback((optionId: string) => {
    if (!current || !choices || choices.chosenId) return;
    const option = current.snapshot.currentChoices?.find((item) => item.id === optionId);
    if (!option) return;
    runtime.selectChoice(optionId);
    onExecutorChoiceSelect?.({ sceneId, choiceId: optionId, stepId: current.stepId, targetSceneId: option.targetSceneId });
  }, [choices, current, onExecutorChoiceSelect, runtime, sceneId]);

  // This scene's part of the strip, as it now is.
  useLayoutEffect(() => {
    session.publish({ key: visit, plan, revealed, choices }, { onTap: handleTap, onChoose: handleChoose });
  }, [choices, handleChoose, handleTap, plan, revealed, session, visit]);

  // Leaving the scene keeps its panels in the strip, unless Back took it away.
  useLayoutEffect(() => () => session.end(visit), [session, visit]);

  const canGoBack = openedNow > 1 || runtime.canRollback || canRollbackScene;
  const handleBack = useCallback(() => {
    if (openedNow > 1) {
      setOpened({ id: currentId, count: openedNow - 1 });
      return;
    }
    if (runtime.canRollback) {
      landOnLastRef.current = true;
      runtime.rollback();
      return;
    }
    if (!canRollbackScene) return;
    // The scene before replays from its start: both leave the strip.
    session.rollBack(visit);
    onRollbackScene?.();
  }, [canRollbackScene, currentId, onRollbackScene, openedNow, runtime, session, visit]);

  return (
    <View pointerEvents="box-none" style={{ flex: 1 }}>
      <Pressable
        onPress={handleBack}
        disabled={!canGoBack}
        accessibilityRole="button"
        accessibilityLabel={t('reader.goBack')}
        accessibilityState={{ disabled: !canGoBack }}
        style={({ pressed }) => ({
          position: 'absolute',
          left: 16,
          bottom: 20,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: 'rgba(20, 20, 23, 0.82)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.18)',
          opacity: !canGoBack ? 0.4 : pressed ? 0.75 : 1,
        })}
      >
        <Text style={{ color: '#f3eee4', fontSize: 14, fontWeight: '600' }}>{`‹ ${t('reader.back')}`}</Text>
      </Pressable>
    </View>
  );
}
