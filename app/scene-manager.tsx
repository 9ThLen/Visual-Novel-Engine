/**
 * app/scene-manager.tsx — Scene Manager Route
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SceneManager } from '@/components/editor/SceneManager';

export default function SceneManagerRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();

  if (!storyId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>No story ID provided</Text>
      </View>
    );
  }

  return <SceneManager storyId={storyId} />;
}
