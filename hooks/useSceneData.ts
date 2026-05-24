import { useState, useCallback, useRef, type MutableRefObject } from 'react';
import type { Story, StoryScene } from '@/lib/types';
import { getCharacterLibrary } from '@/lib/character-library';
import type { InteractiveObject } from '@/lib/interactive-types';
import type { SplashScreenConfig } from '@/lib/splash-types';

interface SaveSceneParams {
  sceneText: string;
  backgroundUri: string;
  voiceUri: string;
  musicUri: string;
  splashConfig: SplashScreenConfig | undefined;
  interactiveObjects: InteractiveObject[];
}

export function useSceneData(
  currentStory: Story | null,
  storyId: string | string[] | undefined,
  sceneId: string | string[] | undefined
) {
  const [scene, setScene] = useState<StoryScene | null>(null);
  const [sceneText, setSceneText] = useState('');
  const [backgroundUri, setBackgroundUri] = useState('');
  const [voiceUri, setVoiceUri] = useState('');
  const [musicUri, setMusicUri] = useState('');
  const [splashConfig, setSplashConfig] = useState<SplashScreenConfig | undefined>(undefined);
  const [interactiveObjects, setInteractiveObjects] = useState<InteractiveObject[]>([]);
  const [characterList, setCharacterList] = useState<string[]>([]);

  const requestIdRef = useRef(0);

  const loadSceneData = useCallback(async (
    skipReloadRef?: MutableRefObject<boolean>
  ) => {
    const requestId = ++requestIdRef.current;
    if (skipReloadRef?.current) {
      skipReloadRef.current = false;
      return;
    }
    if (!currentStory) return;

    if (typeof storyId === 'string') {
      try {
        const chars = await getCharacterLibrary(storyId);
        if (requestId !== requestIdRef.current) return;
        setCharacterList(chars.map((c) => c.name));
      } catch (e) {
        if (__DEV__) console.warn('[useSceneData] Failed to load character library:', e);
        setCharacterList([]);
      }
    }

    const sceneIdStr = typeof sceneId === 'string' ? sceneId : currentStory.startSceneId;
    const foundScene = currentStory.scenes[sceneIdStr];
    if (foundScene) {
      setScene(foundScene);
      setSceneText(foundScene.text);
      setBackgroundUri(foundScene.backgroundImageUri || '');
      setVoiceUri(foundScene.voiceAudioUri || '');
      setMusicUri(foundScene.musicUri || '');
      setSplashConfig(foundScene.splashScreen);
      setInteractiveObjects(foundScene.interactiveObjects || []);
    }
  }, [storyId, sceneId, currentStory]);

  const handleSaveScene = useCallback(async (
    saveScene: (params: SaveSceneParams) => Promise<StoryScene | null>
  ) => {
    const updated = await saveScene({
      sceneText,
      backgroundUri,
      voiceUri,
      musicUri,
      splashConfig,
      interactiveObjects,
    });
    if (updated) setScene(updated);
    return updated;
  }, [sceneText, backgroundUri, voiceUri, musicUri, splashConfig, interactiveObjects]);

  return {
    scene, setScene,
    sceneText, setSceneText,
    backgroundUri, setBackgroundUri,
    voiceUri, setVoiceUri,
    musicUri, setMusicUri,
    splashConfig, setSplashConfig,
    interactiveObjects, setInteractiveObjects,
    characterList, setCharacterList,
    loadSceneData,
    handleSaveScene,
  };
}
