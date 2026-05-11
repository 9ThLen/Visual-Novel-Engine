import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { StoryReaderResponsive } from '@/components/story-reader-responsive';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';
import { InventoryUI } from '@/components/InventoryUI';
import { ReaderMenu } from '@/components/ReaderMenu';
import { useStory } from '@/lib/story-context';
import { useColors } from '@/hooks/use-colors';
import { Choice, PlaybackState } from '@/lib/types';
import { enhancedAudioManager as audioManager } from '@/lib/audio-manager-enhanced';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { useReaderAudio } from '@/hooks/useReaderAudio';
import { useReaderInitialization } from '@/hooks/useReaderInitialization';

export default function ReaderScreen() {
  const router = useRouter();
  const colors = useColors();
  const { storyId } = useLocalSearchParams();
  const { settings } = useStory();
  const [showMenu, setShowMenu] = useState(false);
  const [showInventory, setShowInventory] = useState(false);

  const { isLoading, currentScene, story, playbackState, updatePlaybackState } = useReaderInitialization(storyId);

  // Use the extracted audio hook
  useReaderAudio(currentScene, settings);

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
  };

  const handleContinue = (targetSceneId?: string) => {
    if (isLoading || !story || !playbackState) return;

    if (targetSceneId) {
      navigateToScene(targetSceneId);
      return;
    }

    const currentSceneData = story.scenes[playbackState.currentSceneId];
    if (currentSceneData?.autoAdvance?.enabled && currentSceneData.autoAdvance.nextSceneId) {
      navigateToScene(currentSceneData.autoAdvance.nextSceneId);
      return;
    }

    const nextSceneId = currentSceneData?.choices[0]?.nextSceneId;
    if (nextSceneId) {
      navigateToScene(nextSceneId);
    } else {
      router.back();
    }
  };

  const handleChoiceSelect = (choice: Choice) => {
    if (isLoading || !playbackState) return;
    const updatedChoices = [
      ...playbackState.choicesMade,
      { sceneId: playbackState.currentSceneId, choiceId: choice.id },
    ];
    navigateToScene(choice.nextSceneId, updatedChoices);
  };

  const handleObjectSceneTransition = (sceneId: string) => {
    navigateToScene(sceneId);
  };

  const handleObjectDialogue = (text: string, speaker?: string) => {
    // TODO: Show dialogue overlay
  };

  const sfxPoolIndexRef = React.useRef(0);
  const MAX_SFX_TRACKS = 5;

  const handleObjectPlayAudio = (audioUri: string, volume?: number, loop?: boolean) => {
    resolveAssetUri(audioUri).then((uri) => {
      if (uri) {
        sfxPoolIndexRef.current = (sfxPoolIndexRef.current + 1) % MAX_SFX_TRACKS;
        const trackId = `sfx_object_${sfxPoolIndexRef.current}`;
        audioManager.play(trackId, uri, { volume: volume ?? 0.7, loop: loop ?? false });
      }
    }).catch(() => {
      // Silent fail for missing audio
    });
  };

  if (isLoading || !story || !currentScene || (playbackState && playbackState.storyId !== story.id)) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.foreground, fontSize: 16 }}>Loading story...</Text>
      </ScreenContainer>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Floating menu extracted component */}
      <ReaderMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        onOpenInventory={() => setShowInventory(true)}
      />

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

      {currentScene?.interactiveObjects && currentScene.interactiveObjects.length > 0 && (
        <InteractiveObjectsLayer
          objects={currentScene.interactiveObjects}
          onSceneTransition={handleObjectSceneTransition}
          onDialogue={handleObjectDialogue}
          onPlayAudio={handleObjectPlayAudio}
        />
      )}

      <InventoryUI
        visible={showInventory}
        onClose={() => setShowInventory(false)}
      />
    </View>
  );
}
