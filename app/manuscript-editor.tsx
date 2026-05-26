import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ScreenContainer } from '@/components/screen-container';
import { StoryManuscriptScreen } from '@/components/editor/StoryManuscriptScreen';
import { useStoryActions, useStoryState } from '@/lib/story-hooks';
import { selectSceneRecordsForStory, selectStoryMetadata, useAppStore } from '@/stores/use-app-store';

export default function ManuscriptEditorRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const { isLoaded } = useStoryState();
  const { setCurrentStory } = useStoryActions();

  const storyMetadata = useAppStore(
    useMemo(() => {
      if (!storyId) {
        return () => undefined;
      }

      return selectStoryMetadata(storyId);
    }, [storyId])
  );

  const sceneRecords = useAppStore(
    useMemo(() => {
      if (!storyId) {
        return () => [];
      }

      return selectSceneRecordsForStory(storyId);
    }, [storyId])
  );

  useEffect(() => {
    if (storyId) {
      setCurrentStory(storyId);
    }
  }, [setCurrentStory, storyId]);

  if (!isLoaded) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 12, fontSize: 14 }}>Loading manuscript...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!storyId || !storyMetadata) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16 }}>Invalid story ID</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'left', 'right', 'bottom']}>
      <StoryManuscriptScreen
        storyId={storyId}
        storyMetadata={storyMetadata}
        sceneRecords={sceneRecords}
      />
    </ScreenContainer>
  );
}
