import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { selectReaderStartSceneId, useAppStore } from '@/stores/use-app-store';
import type { Story } from '@/lib/scene-operations';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { TimelineStep, SceneRecord } from '@/lib/engine/types';
import demoStory from '@/assets/demo-story.json';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { shouldReusePlaybackState } from '@/lib/reader-launch';
import { getSceneRecordFromAccess } from '@/lib/scene-access';
import { toReaderScene } from '@/lib/reader-scene';

export function useReaderInitialization(
  storyIdParam?: string | string[],
  options?: { resumeExisting?: boolean },
) {
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const currentStoryId = useAppStore((s) => s.currentStoryId);
  const playbackState = useAppStore((s) => s.playbackState);
  // Select the raw (stable-by-reference) scene record and derive the
  // ReaderScene via useMemo below — toReaderScene() builds a new object on
  // every call, and returning a fresh object straight from a Zustand
  // selector makes useSyncExternalStore think the snapshot changes on every
  // render, which causes an infinite render loop ("Maximum update depth
  // exceeded") even though nothing in the store actually changed.
  const currentSceneRecord = useAppStore((s) =>
    playbackState
      ? getSceneRecordFromAccess(s, playbackState.storyId, playbackState.currentSceneId)
      : undefined,
  );
  // navigateToScene() hydrates the target scene's window *before* committing
  // the new playbackState, and that window hydration replaces the story's
  // scene map with a bounded set that may not include the scene still being
  // displayed. That produces a transient render where playbackState still
  // points at the old scene but its record has just been evicted — without
  // this fallback, the still-mounted executor would see an empty timeline,
  // report itself complete, and fire a bogus "no next connection" transition
  // that races the real navigation. Keep serving the last known-good record
  // for the same scene id until playbackState actually moves on.
  const lastGoodSceneRef = useRef<{ sceneId: string; record: SceneRecord } | null>(null);
  if (currentSceneRecord && playbackState) {
    lastGoodSceneRef.current = { sceneId: playbackState.currentSceneId, record: currentSceneRecord };
  }
  const effectiveSceneRecord =
    currentSceneRecord ??
    (playbackState && lastGoodSceneRef.current?.sceneId === playbackState.currentSceneId
      ? lastGoodSceneRef.current.record
      : undefined);
  const currentReaderScene = useMemo(
    () => (effectiveSceneRecord ? toReaderScene(effectiveSceneRecord) : null),
    [effectiveSceneRecord],
  );
  const setCurrentStory = useAppStore((s) => s.loadCurrentStory);
  const updatePlaybackState = useAppStore((s) => s.updatePlaybackState);
  const hydrateReaderSceneWindow = useAppStore((s) => s.hydrateReaderSceneWindow);
  const currentStoryMetadata = useMemo(
    () => storiesMetadata.find((story) => story.id === currentStoryId) ?? null,
    [currentStoryId, storiesMetadata],
  );
  const [isLoading, setIsLoading] = useState(true);
  const initRequestIdRef = useRef(0);
  const resumeExisting = options?.resumeExisting ?? false;
  // Safety timeout: force loading to resolve after 10s even if initialization hangs
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTimeline: TimelineStep[] = useMemo(() => {
    if (!currentStoryMetadata || !playbackState) return [];
    return currentReaderScene?.timeline ?? [];
  }, [currentReaderScene, currentStoryMetadata, playbackState]);

  const stateRef = useRef({ currentStoryId, playbackState });

  useEffect(() => {
    stateRef.current = { currentStoryId, playbackState };
  }, [currentStoryId, playbackState]);

  const initializeReader = useCallback(async () => {
    const requestId = ++initRequestIdRef.current;
    setIsLoading(true);

    try {
      let selectedStoryId: string | null = null;

      if (storyIdParam && typeof storyIdParam === 'string') {
        const metadata = storiesMetadata.find((s) => s.id === storyIdParam);
        if (metadata) {
          selectedStoryId = metadata.id;
        }
      }

      if (!selectedStoryId) {
        const demoMetadata = (demoStory as unknown as Story);
        if (!demoMetadata?.id) throw new Error('Demo story has no id');
        selectedStoryId = demoMetadata.id;
        const hasDemo = storiesMetadata.some(s => s.id === selectedStoryId);
        if (!hasDemo) {
          if (__DEV__) console.warn('Demo story metadata missing from context. Attempting to load anyway...');
        }
      }

      if (requestId !== initRequestIdRef.current) return;

      if (stateRef.current.currentStoryId !== selectedStoryId) {
        await setCurrentStory(selectedStoryId);
      }

      if (requestId !== initRequestIdRef.current) return;

      const metadata = storiesMetadata.find((s) => s.id === selectedStoryId) || (demoStory as unknown as Story);
      const reusablePlaybackState = shouldReusePlaybackState(
        stateRef.current.playbackState,
        selectedStoryId,
        resumeExisting,
      )
        ? stateRef.current.playbackState
        : null;
      const initialSceneId = reusablePlaybackState?.currentSceneId ?? metadata.startSceneId;
      let initialSceneHydrated = initialSceneId
        ? await hydrateReaderSceneWindow(selectedStoryId, initialSceneId)
        : false;

      if (requestId !== initRequestIdRef.current) return;

      if (reusablePlaybackState && initialSceneHydrated) {
        setIsLoading(false);
        return;
      }

      if (requestId !== initRequestIdRef.current) return;

      if (
        reusablePlaybackState &&
        !initialSceneHydrated &&
        metadata.startSceneId &&
        metadata.startSceneId !== initialSceneId
      ) {
        initialSceneHydrated = await hydrateReaderSceneWindow(selectedStoryId, metadata.startSceneId);
      }

      if (requestId !== initRequestIdRef.current) return;

      const startSceneId = selectReaderStartSceneId(metadata.id, metadata.startSceneId)(
        useAppStore.getState(),
      );
      if (!startSceneId) {
        throw new Error(`Story ${metadata.id} has no readable start scene`);
      }
      const newPlaybackState: PlaybackState = {
        storyId: metadata.id,
        currentSceneId: startSceneId,
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
      };
      updatePlaybackState(newPlaybackState);

    } catch (error) {
      if (requestId !== initRequestIdRef.current) return;
      ErrorHandler.handle('Failed to initialize reader', error, ErrorCategory.STORAGE);
    } finally {
      if (requestId === initRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    hydrateReaderSceneWindow,
    resumeExisting,
    storyIdParam,
    storiesMetadata,
    setCurrentStory,
    updatePlaybackState,
  ]);

  useEffect(() => {
    safetyTimerRef.current = setTimeout(() => {
      safetyTimerRef.current = null;
      setIsLoading(false);
    }, 10_000);
    initializeReader();
    return () => {
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    };
  }, [initializeReader]);

  // Synchronize loading state: only resolve loading when we have a valid synchronized scene
  useEffect(() => {
    if (currentReaderScene && currentStoryMetadata && playbackState?.storyId === currentStoryMetadata.id) {
      setIsLoading(false);
    }
  }, [currentReaderScene, currentStoryMetadata, playbackState]);

  return {
    isLoading,
    scene: currentReaderScene,
    sceneRecord: currentReaderScene,
    timeline: currentTimeline,
    story: currentStoryMetadata,
    playbackState,
    updatePlaybackState,
  };
}
