import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { selectReaderScene, selectReaderStartSceneId, useAppStore } from '@/stores/use-app-store';
import type { Story } from '@/lib/scene-operations';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { TimelineStep } from '@/lib/engine/types';
import demoStory from '@/assets/demo-story.json';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { shouldReusePlaybackState } from '@/lib/reader-launch';
import type { ReaderScene } from '@/lib/reader-scene';

export function useReaderInitialization(
  storyIdParam?: string | string[],
  options?: { resumeExisting?: boolean },
) {
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const currentStoryId = useAppStore((s) => s.currentStoryId);
  const playbackState = useAppStore((s) => s.playbackState);
  const currentReaderScene = useAppStore((s) =>
    playbackState
      ? selectReaderScene(playbackState.storyId, playbackState.currentSceneId)(s)
      : null,
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
