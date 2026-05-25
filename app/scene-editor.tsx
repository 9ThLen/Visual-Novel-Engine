/**
 * app/scene-editor.tsx — Scene Editor Route
 *
 * This is the main entry point for editing a scene.
 * It loads scene data from the app store, then renders
 * the new SceneComposer component (replacing the old Lego editor).
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useStoryState, useStoryActions } from '@/lib/story-hooks';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SceneComposer } from '@/components/editor/SceneComposer';
import { createEditorSceneDraft } from '@/lib/editor-scene-draft';
import { selectCanonicalSceneRecord, useAppStore } from '@/stores/use-app-store';

export default function SceneEditorScreen() {
  const router = useRouter();
  const { storyId, sceneId } = useLocalSearchParams<{
    storyId: string;
    sceneId: string;
  }>();

  const { isLoaded } = useStoryState();
  const { setCurrentStory } = useStoryActions();
  const layout = useResponsiveLayout();
  const canonicalSceneRecord = useAppStore(
    useMemo(() => {
      if (!storyId || !sceneId) {
        return () => undefined;
      }

      return selectCanonicalSceneRecord(storyId, sceneId);
    }, [sceneId, storyId])
  );

  // Set current story on mount
  useEffect(() => {
    if (storyId) {
      setCurrentStory(storyId);
    }
  }, [storyId, setCurrentStory]);

  // Loading state
  if (!isLoaded) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 12, fontSize: 14 }}>Loading...</Text>
        </View>
      </ScreenContainer>
    );
  }

  // Validate params
  if (!storyId || !sceneId) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16 }}>Invalid story or scene ID</Text>
        </View>
      </ScreenContainer>
    );
  }

  const initialSceneDraft = useMemo(
    () => createEditorSceneDraft(canonicalSceneRecord, sceneId),
    [canonicalSceneRecord, sceneId]
  );

  return (
    <ErrorBoundary>
      <SceneComposer
        storyId={storyId}
        sceneId={sceneId}
        initialSceneDraft={initialSceneDraft}
      />
    </ErrorBoundary>
  );
}
