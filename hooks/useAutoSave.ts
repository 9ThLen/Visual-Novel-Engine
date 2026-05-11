import { useEffect, useRef } from 'react';
import { Story, PlaybackState, SaveSlot } from '../lib/types';
import { StoryDomain } from '../lib/story-domain';

interface AutoSaveProps {
  playbackState: PlaybackState | null;
  currentStory: Story | null;
  saveSlots: SaveSlot[];
  onAutoSave: (newSlot: SaveSlot) => Promise<void>;
  enabled: boolean;
}

export function useAutoSave({
  playbackState,
  currentStory,
  saveSlots,
  onAutoSave,
  enabled
}: AutoSaveProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !playbackState || !currentStory || !playbackState.isPlaying) {
      return;
    }

    // Debounce auto-save (e.g., 2000ms to be less aggressive than the previous 500ms)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      const currentScene = currentStory.scenes[playbackState.currentSceneId];
      const newSlot = StoryDomain.createSaveSlot(
        'autosave',
        currentStory,
        playbackState,
        currentScene
      );

      await onAutoSave(newSlot);
    }, 2000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [playbackState, currentStory, onAutoSave, enabled]);
}
