/**
 * app/play.tsx — Play Mode Route
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PlayMode } from '@/components/editor/PlayMode';
import { useAppStore } from '@/stores/use-app-store';

export default function PlayRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const isLoaded = useAppStore((state) => state.isLoaded);
  const hydrateSceneRecordsForStory = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const [hydratedStoryId, setHydratedStoryId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHydratedStoryId(null);

    if (!storyId || !isLoaded) return () => {
      cancelled = true;
    };

    void hydrateSceneRecordsForStory(storyId).finally(() => {
      if (!cancelled) setHydratedStoryId(storyId);
    });

    return () => {
      cancelled = true;
    };
  }, [hydrateSceneRecordsForStory, isLoaded, storyId]);

  if (!storyId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>No story ID provided</Text>
      </View>
    );
  }

  if (!isLoaded || hydratedStoryId !== storyId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Loading story...</Text>
      </View>
    );
  }

  return <PlayMode storyId={storyId} />;
}
