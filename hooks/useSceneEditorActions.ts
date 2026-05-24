import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Story, StoryScene, Choice } from '@/lib/types';
import { SplashScreenConfig } from '@/lib/splash-types';
import { InteractiveObject } from '@/lib/interactive-types';
import { useAppStore, selectStoryScenes } from '@/stores/use-app-store';
import { useLegoStore, selectLegoSceneById, selectLegoActiveScene } from '@/stores/use-lego-store';
import { extractAudioUrisFromLegoElements } from '@/lib/lego-scene-export';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '@/lib/error-handler';

interface SceneSaveData {
  sceneText: string;
  backgroundUri: string;
  voiceUri: string;
  musicUri: string;
  splashConfig?: SplashScreenConfig;
  interactiveObjects: InteractiveObject[];
}

export function useSceneEditorActions(
  currentStory: Story | null,
  scene: StoryScene | null,
  loadStories: () => Promise<void>,
  skipNextReloadRef: React.MutableRefObject<boolean>
) {
  const router = useRouter();

  const handleSaveScene = useCallback(async (data: SceneSaveData) => {
    if (!currentStory || !scene) return null;
    let updatedScene: StoryScene | undefined;
    try {
      const storyScenes = selectStoryScenes(currentStory.id)(useAppStore.getState());
      const latestScene = storyScenes[scene.id] ?? scene;

      const legoState = useLegoStore.getState();
      const legoScene =
        selectLegoSceneById(scene.id)(legoState) ?? selectLegoActiveScene(legoState);
      const legoAudio = legoScene
        ? extractAudioUrisFromLegoElements(legoScene.elements)
        : {};

      updatedScene = {
        ...latestScene,
        text: data.sceneText,
        backgroundImageUri: data.backgroundUri || undefined,
        voiceAudioUri: data.voiceUri || legoAudio.voiceUri || undefined,
        musicUri: data.musicUri || legoAudio.musicUri || undefined,
        splashScreen: data.splashConfig,
        interactiveObjects: data.interactiveObjects.length > 0 ? data.interactiveObjects : undefined,
      };
      await useAppStore.getState().saveScene(currentStory.id, updatedScene!);
    } catch {
      Alert.alert('Error', 'Failed to save scene');
      return null;
    }
    skipNextReloadRef.current = true;
    try {
      await loadStories();
    } catch {
      ErrorHandler.handle('Scene saved but reload failed', undefined, ErrorCategory.STORAGE, ErrorSeverity.LOW);
    }
    Alert.alert('Saved', 'Scene saved successfully!');
    return updatedScene ?? null;
  }, [currentStory, scene, loadStories, skipNextReloadRef]);

  const handleAddScene = useCallback(async (sceneList: string[], setSceneList: (list: string[]) => void) => {
    if (!currentStory) return;
    const newSceneId = `scene_${Date.now()}`;
    const newScene: StoryScene = {
      id: newSceneId, text: 'New scene...', backgroundImageUri: undefined,
      characters: [], voiceAudioUri: undefined, choices: [], musicUri: undefined,
    };
    try {
      await useAppStore.getState().saveScene(currentStory.id, newScene);
      setSceneList([...sceneList, newSceneId]);
      await loadStories();
      Alert.alert('Created', `Scene "${newSceneId}" added.`);
    } catch (error) { Alert.alert('Error', 'Failed to create scene'); }
  }, [currentStory, loadStories]);

  const handleDeleteScene = useCallback(async (sceneIdToDelete: string, sceneList: string[], setSceneList: (list: string[]) => void) => {
    if (!currentStory || sceneIdToDelete === currentStory.startSceneId) {
      Alert.alert('Error', 'Cannot delete the start scene');
      return;
    }
    Alert.alert('Delete Scene', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await useAppStore.getState().deleteScene(currentStory.id, sceneIdToDelete);
            setSceneList(sceneList.filter((s) => s !== sceneIdToDelete));
            await loadStories();
            if (scene?.id === sceneIdToDelete) router.back();
          } catch { Alert.alert('Error', 'Failed to delete scene'); }
        },
      },
    ]);
  }, [currentStory, scene, loadStories, router]);

  const handleAddChoice = useCallback(async (text: string, target: string, setScene: (s: StoryScene) => void) => {
    if (!text.trim() || !target.trim()) {
      Alert.alert('Error', 'Fill in both choice text and target scene');
      return;
    }
    if (!currentStory || !scene) return;
    const newChoice: Choice = {
      id: `choice-${Date.now()}`,
      text: text,
      nextSceneId: target,
    };
    try {
      const storyScenes = selectStoryScenes(currentStory.id)(useAppStore.getState());
      const latestScene = storyScenes[scene.id] ?? scene;
      const updated: StoryScene = { ...latestScene, choices: [...latestScene.choices, newChoice] };
      await useAppStore.getState().saveScene(currentStory.id, updated);
      setScene(updated);
      return true;
    } catch { 
      Alert.alert('Error', 'Failed to add choice'); 
      return false;
    }
  }, [currentStory, scene]);

  const handleDeleteChoice = useCallback(async (choiceId: string, setScene: (s: StoryScene) => void) => {
    if (!currentStory || !scene) return;
    try {
      await useAppStore.getState().deleteChoice(currentStory.id, scene.id, choiceId);
      setScene({ ...scene, choices: scene.choices.filter((c) => c.id !== choiceId) });
    } catch { Alert.alert('Error', 'Failed to delete choice'); }
  }, [currentStory, scene]);

  return {
    handleSaveScene,
    handleAddScene,
    handleDeleteScene,
    handleAddChoice,
    handleDeleteChoice,
  };
}
