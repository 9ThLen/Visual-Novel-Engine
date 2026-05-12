import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStory } from '@/lib/story-context';
import { Story, PlaybackState } from '@/lib/types';
import demoStory from '@/assets/demo-story.json';

export function useReaderInitialization(storyIdParam?: string | string[]) {
  const { stories, currentStory, playbackState, setCurrentStory, updatePlaybackState } = useStory();
  const [isLoading, setIsLoading] = useState(true);
  const initRequestIdRef = useRef(0);

  const currentScene = useMemo(() => {
    if (!currentStory || !playbackState || playbackState.storyId !== currentStory.id) return null;
    return currentStory.scenes[playbackState.currentSceneId] || null;
  }, [currentStory, playbackState]);

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
        selectedStoryId = (demoStory as unknown as Story).id;
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

      if (stateRef.current.playbackState && stateRef.current.playbackState.storyId === selectedStoryId) {
        return;
      }

      const metadata = stories.find((s) => s.id === selectedStoryId) || (demoStory as unknown as Story);
      const newPlaybackState: PlaybackState = {
        storyId: metadata.id,
        currentSceneId: metadata.startSceneId,
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
      };
      updatePlaybackState(newPlaybackState);

    } catch (error) {
      if (requestId !== initRequestIdRef.current) return;
      if (__DEV__) console.error('Failed to initialize reader:', error);
      setIsLoading(false);
    }
  }, [storyIdParam, stories, setCurrentStory, updatePlaybackState]);

  useEffect(() => {
    initializeReader();
  }, [initializeReader]);

  // Synchronize loading state: only resolve loading when we have a valid synchronized scene
  useEffect(() => {
    if (currentScene && currentStory && playbackState?.storyId === currentStory.id) {
      setIsLoading(false);
    }
  }, [currentScene, currentStory, playbackState]);

  return { isLoading, currentScene, story: currentStory, playbackState, updatePlaybackState };
}
