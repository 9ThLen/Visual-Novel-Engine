import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { StoryReaderResponsive } from '@/components/story-reader-responsive';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';
import { InventoryUI } from '@/components/InventoryUI';
import { useStory } from '@/lib/story-context';
import { useColors } from '@/hooks/use-colors';
import { Story, StoryScene, Choice, PlaybackState } from '@/lib/types';
import { audioManager } from '@/lib/audio-manager';
import demoStory from '@/assets/demo-story.json';

export default function ReaderScreen() {
  const router = useRouter();
  const colors = useColors();
  const { storyId } = useLocalSearchParams();
  const { stories, settings, setCurrentStory, updatePlaybackState, playbackState, autoSave } = useStory();
  const [showMenu, setShowMenu] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [story, setStory] = useState<Story | null>(null);
  const [currentScene, setCurrentScene] = useState<StoryScene | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeReader();
    return () => { audioManager.stopAll(true); };
  }, [storyId]);

  // Play BGM when scene changes
  useEffect(() => {
    if (!currentScene) return;
    if (currentScene.musicUri) {
      audioManager.crossFade('bgm', currentScene.musicUri, settings.bgmVolume);
    }
    if (currentScene.voiceAudioUri) {
      audioManager.play('voice', currentScene.voiceAudioUri, { volume: settings.voiceVolume });
    }
  }, [currentScene?.id]);

  const initializeReader = async () => {
    try {
      let selectedStory: Story | null = null;
      if (storyId && typeof storyId === 'string') {
        selectedStory = stories.find((s) => s.id === storyId) || null;
      }
      if (!selectedStory) selectedStory = demoStory as Story;

      setStory(selectedStory);
      setCurrentStory(selectedStory);

      const newPlaybackState: PlaybackState = {
        storyId: selectedStory.id,
        currentSceneId: selectedStory.startSceneId,
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
      };
      updatePlaybackState(newPlaybackState);
      setCurrentScene(selectedStory.scenes[selectedStory.startSceneId]);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to initialize reader:', error);
      setIsLoading(false);
    }
  };

  const navigateToScene = (sceneId: string, choicesMade?: Array<{ sceneId: string; choiceId: string }>) => {
    if (!story) return;
    const nextScene = story.scenes[sceneId];
    if (!nextScene) return;
    const updated: PlaybackState = {
      storyId: story.id,
      currentSceneId: sceneId,
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: choicesMade || playbackState?.choicesMade || [],
    };
    updatePlaybackState(updated);
    setCurrentScene(nextScene);

    // Auto-save on scene change
    setTimeout(() => {
      autoSave();
    }, 500);
  };

  const handleContinue = () => {
    if (!story || !playbackState) return;
    const nextSceneId = story.scenes[playbackState.currentSceneId]?.choices[0]?.nextSceneId;
    if (nextSceneId) navigateToScene(nextSceneId);
    else router.back();
  };

  const handleChoiceSelect = (choice: Choice) => {
    if (!playbackState) return;
    const updatedChoices = [
      ...playbackState.choicesMade,
      { sceneId: playbackState.currentSceneId, choiceId: choice.id },
    ];
    navigateToScene(choice.nextSceneId, updatedChoices);
  };

  // Interactive object handlers
  const handleObjectSceneTransition = (sceneId: string) => {
    navigateToScene(sceneId);
  };

  const handleObjectDialogue = (text: string, speaker?: string) => {
    // TODO: Show dialogue overlay
    console.log('Dialogue:', speaker, text);
  };

  const handleObjectPlayAudio = (audioUri: string, volume?: number, loop?: boolean) => {
    audioManager.play('sfx', audioUri, { volume: volume ?? 0.7, loop: loop ?? false });
  };

  if (isLoading || !story || !currentScene) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.foreground, fontSize: 16 }}>Loading story...</Text>
      </ScreenContainer>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Floating menu */}
      {showMenu && (
        <View
          style={{
            position: 'absolute',
            top: 48,
            left: 16,
            zIndex: 100,
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 8,
            borderWidth: 1,
            borderColor: colors.border,
            minWidth: 140,
          }}
        >
          {[
            { label: '💾 Save / Load', action: () => { setShowMenu(false); router.push('../save-load'); } },
            { label: '🎒 Inventory', action: () => { setShowMenu(false); setShowInventory(true); } },
            { label: '⚙️ Settings', action: () => { setShowMenu(false); router.push('../settings'); } },
            { label: '🏠 Home', action: () => router.back() },
            { label: '✕ Close menu', action: () => setShowMenu(false) },
          ].map((item) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => ({
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 8,
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={item.action}
            >
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '500' }}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Menu button */}
      <Pressable
        style={({ pressed }) => ({
          position: 'absolute',
          top: 48,
          left: 16,
          zIndex: showMenu ? 99 : 50,
          backgroundColor: 'rgba(0,0,0,0.45)',
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.18)',
          opacity: pressed ? 0.8 : 1,
        })}
        onPress={() => setShowMenu(!showMenu)}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>☰</Text>
      </Pressable>

      <StoryReaderResponsive
        scene={currentScene}
        onContinue={handleContinue}
        onChoiceSelect={handleChoiceSelect}
        isLoading={isLoading}
        settings={settings}
      />

      {/* Interactive Objects Layer */}
      {currentScene?.interactiveObjects && currentScene.interactiveObjects.length > 0 && (
        <InteractiveObjectsLayer
          objects={currentScene.interactiveObjects}
          onSceneTransition={handleObjectSceneTransition}
          onDialogue={handleObjectDialogue}
          onPlayAudio={handleObjectPlayAudio}
        />
      )}

      {/* Inventory UI */}
      <InventoryUI
        visible={showInventory}
        onClose={() => setShowInventory(false)}
      />
    </View>
  );
}
