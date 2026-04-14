/**
 * Professional Node-Based Story Editor
 * Complete redesign with split-panel layout
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { NodeCanvas, SceneEditorPanel } from '@/components/node-editor';
import { useStory } from '@/lib/story-context';
import { useColors } from '@/hooks/use-colors';
import type { Story, StoryScene, Choice } from '@/lib/types';
import * as storyContextEnhanced from '@/lib/story-context-enhanced';

export default function NodeEditorScreen() {
  const colors = useColors();
  const { storyId } = useLocalSearchParams();
  const { stories, loadStories } = useStory();

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // Handle node selection
  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedSceneId(nodeId);
  }, []);

  const story = stories.find((s) => s.id === storyId) as Story | undefined;

  // Handle node connection (create choice)
  const handleNodeConnect = useCallback(
    async (sourceId: string, targetId: string) => {
      if (!story) return;

      try {
        const sourceScene = story.scenes[sourceId];
        if (!sourceScene) return;

        const newChoice: Choice = {
          id: `choice-${Date.now()}`,
          text: `Go to ${targetId}`,
          nextSceneId: targetId,
        };

        await storyContextEnhanced.addChoice(story.id, sourceId, newChoice);
        await loadStories();
        Alert.alert('Success', 'Connection created');
      } catch {
        Alert.alert('Error', 'Failed to create connection');
      }
    },
    [story, loadStories]
  );

  // Handle node context menu
  const handleNodeContextMenu = useCallback(
    (nodeId: string) => {
      if (!story) return;

      Alert.alert(
        'Scene Actions',
        `Scene: ${nodeId}`,
        [
          {
            text: 'Edit',
            onPress: () => setSelectedSceneId(nodeId),
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              if (nodeId === story.startSceneId) {
                Alert.alert('Error', 'Cannot delete start scene');
                return;
              }
              try {
                await storyContextEnhanced.deleteScene(story.id, nodeId);
                await loadStories();
                if (selectedSceneId === nodeId) {
                  setSelectedSceneId(null);
                }
              } catch {
                Alert.alert('Error', 'Failed to delete scene');
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    },
    [story, selectedSceneId, loadStories]
  );

  // Handle scene save
  const handleSceneSave = useCallback(
    async (scene: StoryScene) => {
      if (!story) return;

      try {
        await storyContextEnhanced.updateScene(story.id, scene);
        await loadStories();
        Alert.alert('Success', 'Scene saved');
      } catch {
        Alert.alert('Error', 'Failed to save scene');
      }
    },
    [story, loadStories]
  );

  // Handle add choice
  const handleAddChoice = useCallback(
    async (sceneId: string, choice: Choice) => {
      if (!story) return;

      try {
        await storyContextEnhanced.addChoice(story.id, sceneId, choice);
        await loadStories();
      } catch {
        Alert.alert('Error', 'Failed to add choice');
      }
    },
    [story, loadStories]
  );

  // Handle delete choice
  const handleDeleteChoice = useCallback(
    async (sceneId: string, choiceId: string) => {
      if (!story) return;

      try {
        await storyContextEnhanced.deleteChoice(story.id, sceneId, choiceId);
        await loadStories();
      } catch {
        Alert.alert('Error', 'Failed to delete choice');
      }
    },
    [story, loadStories]
  );

  // Handle navigate to scene
  const handleNavigateToScene = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId);
  }, []);

  if (!story) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.foreground }}>Story not found</Text>
      </ScreenContainer>
    );
  }

  return (
    <View style={styles.container}>
      {/* Left Panel: Node Canvas */}
      <View style={[styles.leftPanel, { borderRightColor: colors.border }]}>
        <NodeCanvas
          story={story}
          selectedSceneId={selectedSceneId}
          onNodeSelect={handleNodeSelect}
          onNodeConnect={handleNodeConnect}
          onNodeContextMenu={handleNodeContextMenu}
        />
      </View>

      {/* Right Panel: Scene Editor */}
      <View style={styles.rightPanel}>
        <SceneEditorPanel
          story={story}
          sceneId={selectedSceneId}
          onSave={handleSceneSave}
          onAddChoice={handleAddChoice}
          onDeleteChoice={handleDeleteChoice}
          onNavigateToScene={handleNavigateToScene}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    flex: 2,
    borderRightWidth: 1,
  },
  rightPanel: {
    flex: 1,
    minWidth: 320,
    maxWidth: 420,
  },
});
