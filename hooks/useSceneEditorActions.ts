import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Story, StoryScene, Choice } from '@/lib/types';
import { SplashScreenConfig } from '@/lib/splash-types';
import { InteractiveObject } from '@/lib/interactive-types';
import * as storyContextEnhanced from '@/lib/story-context-enhanced';
import { Block } from '@/lib/block-types';

interface SceneSaveData {
  sceneText: string;
  backgroundUri: string;
  voiceUri: string;
  musicUri: string;
  splashConfig: SplashScreenConfig;
  interactiveObjects: InteractiveObject[];
  sceneRoot: { children: Block[] };
}

export function useSceneEditorActions(
  currentStory: Story | null,
  scene: StoryScene | null,
  loadStories: () => Promise<void>,
  skipNextReloadRef: React.MutableRefObject<boolean>
) {
  const router = useRouter();

  const handleSaveScene = useCallback(async (data: SceneSaveData) => {
    if (!currentStory || !scene) return;
    try {
      const blocksToSave: Block[] | undefined = data.sceneRoot?.children?.length > 0 ?
        data.sceneRoot.children.map((block: Block) => ({
          ...block,
          x: block.x ?? undefined,
          y: block.y ?? undefined,
        })) : undefined;

      const updatedScene: StoryScene = {
        ...scene,
        text: data.sceneText,
        backgroundImageUri: data.backgroundUri || undefined,
        voiceAudioUri: data.voiceUri || undefined,
        musicUri: data.musicUri || undefined,
        splashScreen: data.splashConfig,
        interactiveObjects: data.interactiveObjects.length > 0 ? data.interactiveObjects : undefined,
        blocks: blocksToSave,
      };
      await storyContextEnhanced.updateScene(currentStory.id, updatedScene);
      
      skipNextReloadRef.current = true;
      await loadStories();
      Alert.alert('Saved', 'Scene saved successfully!');
      return updatedScene;
    } catch { 
      Alert.alert('Error', 'Failed to save scene'); 
    }
  }, [currentStory, scene, loadStories, skipNextReloadRef]);

  const handleAddScene = useCallback(async (sceneList: string[], setSceneList: (list: string[]) => void) => {
    if (!currentStory) return;
    const newSceneId = `scene_${Date.now()}`;
    const newScene: StoryScene = {
      id: newSceneId, text: 'New scene...', backgroundImageUri: undefined,
      characters: [], voiceAudioUri: undefined, choices: [], musicUri: undefined,
    };
    try {
      await storyContextEnhanced.addScene(currentStory.id, newScene);
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
            await storyContextEnhanced.deleteScene(currentStory.id, sceneIdToDelete);
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
      const updated: StoryScene = { ...scene, choices: [...scene.choices, newChoice] };
      await storyContextEnhanced.updateScene(currentStory.id, updated);
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
      await storyContextEnhanced.deleteChoice(currentStory.id, scene.id, choiceId);
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
