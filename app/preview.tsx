/**
 * app/preview.tsx — Full Preview Mode Screen
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useStoryState } from '@/lib/story-hooks';
import { PreviewScreen } from '@/components/editor/PreviewScreen';

export default function PreviewRoute() {
  const { storyId, sceneId } = useLocalSearchParams<{ storyId: string; sceneId: string }>();
  const { isLoaded } = useStoryState();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!storyId || !sceneId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>No story or scene ID provided</Text>
      </View>
    );
  }

  return <PreviewScreen storyId={storyId} sceneId={sceneId} />;
}
