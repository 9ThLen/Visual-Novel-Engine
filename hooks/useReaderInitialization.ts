import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStoryState, useStoryActions } from '@/lib/story-hooks';
import { resolveRuntimeCurrentScene } from '@/lib/runtime-story';
import { resolveCanonicalStartSceneId } from '@/lib/scene-operations';
import { useAppStore } from '@/stores/use-app-store';
import type { PlaybackState, Story } from '@/lib/types';
import demoStory from '@/assets/demo-story.json';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { shouldReusePlaybackState } from '@/lib/reader-launch';

export function useReaderInitialization(
  storyIdParam?: string | string[],
  options?: { resumeExisting?: boolean },
) {
  const { stories, currentStory, playbackState, scenesByStory, sceneRecordsByStory } = useStoryState();
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const { setCurrentStory, updatePlaybackState } = useStoryActions();
  const [isLoading, setIsLoading] = useState(true);
  const initRequestIdRef = useRef(0);
  const resumeExisting = options?.resumeExisting ?? false;
  // Safety timeout: force loading to resolve after 10s even if initialization hangs
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentScene = useMemo(() => {
    if (!currentStory || !playbackState || playbackState.storyId !== currentStory.id) return null;

    return resolveRuntimeCurrentScene(
      { scenesByStory, sceneRecordsByStory },
      playbackState
    );
  }, [currentStory, playbackState, sceneRecordsByStory, scenesByStory]);

  const stateRef = useRef({ currentStory, playbackState });

  useEffect(() => {
    stateRef.current = { currentStory, playbackState };
  }, [currentStory, playbackState]);

  const initializeReader = useCallback(async () => {
    const requestId = ++initRequestIdRef.current;
    setIsLoading(true);

    try {
      let selectedStoryId: string | null = null;

      if (storyIdParam && typeof storyIdParam === 'string') {
        const metadata = stories.find((s) => s.id === storyIdParam);
        if (metadata) {
          selectedStoryId = metadata.id;
        }
      }

      if (!selectedStoryId) {
        const demoMetadata = (demoStory as unknown as Story);
        if (!demoMetadata?.id) throw new Error('Demo story has no id');
        selectedStoryId = demoMetadata.id;
        const hasDemo = stories.some(s => s.id === selectedStoryId);
        if (!hasDemo) {
          if (__DEV__) console.warn('Demo story metadata missing from context. Attempting to load anyway...');
        }
      }

      if (requestId !== initRequestIdRef.current) return;

      if (stateRef.current.currentStory?.id !== selectedStoryId) {
        await setCurrentStory(selectedStoryId);
      }

      if (requestId !== initRequestIdRef.current) return;

      if (shouldReusePlaybackState(stateRef.current.playbackState, selectedStoryId, resumeExisting)) {
        setIsLoading(false);
        return;
      }

      if (requestId !== initRequestIdRef.current) return;

      const metadata = stories.find((s) => s.id === selectedStoryId) || (demoStory as unknown as Story);
      const startSceneId = resolveCanonicalStartSceneId(
        {
          storiesMetadata,
          sceneRecordsByStory,
        },
        metadata.id,
        metadata.startSceneId
      ) || metadata.startSceneId;
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
  }, [resumeExisting, storyIdParam, stories, storiesMetadata, sceneRecordsByStory, setCurrentStory, updatePlaybackState]);

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
    if (currentScene && currentStory && playbackState?.storyId === currentStory.id) {
      setIsLoading(false);
    }
  }, [currentScene, currentStory, playbackState]);

  return { isLoading, currentScene, story: currentStory, playbackState, updatePlaybackState };
}
