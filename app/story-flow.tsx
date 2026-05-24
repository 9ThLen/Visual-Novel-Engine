/**
 * app/story-flow.tsx — Story Flow Node Graph Screen
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useStoryState } from '@/lib/story-hooks';
import { StoryFlowScreen } from '@/components/editor/StoryFlowScreen';

export default function StoryFlowRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const { isLoaded } = useStoryState();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!storyId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>No story ID provided</Text>
      </View>
    );
  }

  return <StoryFlowScreen storyId={storyId} />;
}
