/**
 * app/play.tsx — Play Mode Route
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PlayMode } from '@/components/editor/PlayMode';

export default function PlayRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();

  if (!storyId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>No story ID provided</Text>
      </View>
    );
  }

  return <PlayMode storyId={storyId} />;
}
