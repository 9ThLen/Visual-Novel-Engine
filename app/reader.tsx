import React, { useEffect, useState, useCallback } from 'react';
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
import { resolveAssetUri } from '@/lib/asset-resolver';
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

  const initializeReader = useCallback(async () => {
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
  }, [storyId, stories, setCurrentStory, updatePlaybackState]);

  useEffect(() => {
    initializeReader();
    return () => { audioManager.stopAll(true); };
  }, [initializeReader]);

  // Play BGM when scene changes
  useEffect(() => {
    if (!currentScene) return;

    let isMounted = true;

    // Resolve and play music (only if URI is provided and valid)
    if (currentScene.musicUri && currentScene.musicUri.trim()) {
      resolveAssetUri(currentScene.musicUri).then((uri) => {
        if (isMounted && uri) {
          audioManager.crossFade('bgm', uri, settings.bgmVolume);
        } else if (isMounted) {
          audioManager.stop('bgm');
        }
      }).catch(() => {
        // Silent fail for missing music
        if (isMounted) audioManager.stop('bgm');
      });
    } else {
      // No music URI, stop playing
      audioManager.stop('bgm');
    }

    // Resolve and play voice
    if (currentScene.voiceAudioUri && currentScene.voiceAudioUri.trim()) {
      resolveAssetUri(currentScene.voiceAudioUri).then((uri) => {
        if (isMounted && uri) {
          audioManager.play('voice', uri, { volume: settings.voiceVolume });
        }
      }).catch(() => {
        // Silent fail for missing voice
      });
    }

    return () => {
      isMounted = false;
    };
  }, [currentScene?.id]);

  const navigateToScene = (sceneId: string, choicesMade?: { sceneId: string; choiceId: string }[]) => {
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
  };

  const handleObjectPlayAudio = (audioUri: string, volume?: number, loop?: boolean) => {
    resolveAssetUri(audioUri).then((uri) => {
      if (uri) {
        audioManager.play('sfx', uri, { volume: volume ?? 0.7, loop: loop ?? false });
      }
    }).catch(() => {
      // Silent fail for missing audio
    });
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
        <>
          {/* Backdrop */}
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              zIndex: 99,
            }}
            onPress={() => setShowMenu(false)}
          />
          {/* Menu */}
          <View
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: [{ translateX: -160 }, { translateY: -200 }],
              zIndex: 100,
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
              width: 320,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
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
                  paddingVertical: 14,
                  paddingHorizontal: 18,
                  borderRadius: 10,
                  backgroundColor: pressed ? colors.background : 'transparent',
                  marginBottom: 4,
                })}
                onPress={item.action}
              >
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '500' }}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
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
