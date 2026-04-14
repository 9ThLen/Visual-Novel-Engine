import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useStory } from '@/lib/story-context';
import { useColors } from '@/hooks/use-colors';
import { Story } from '@/lib/types';
import { HelpableElement } from '@/components/HelpableElement';
import { HelpModeToggle } from '@/components/HelpModeToggle';
import { HelpTooltip } from '@/components/HelpTooltip';
import { GuidedTourOverlay } from '@/components/GuidedTourOverlay';
import { FirstTimeGuide } from '@/components/FirstTimeGuide';
import { Button } from '@/components/ui/Button';
import { DesktopLayout } from '@/components/DesktopLayout';
import { TopBarAction } from '@/components/WebTopBar';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/use-keyboard-shortcuts';
import { getResponsiveValues, getWebLayout } from '@/lib/responsive';

export default function EditorScreen() {
  const router = useRouter();
  const colors = useColors();
  const { stories, addStory, deleteStory } = useStory();
  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [showNewStoryForm, setShowNewStoryForm] = useState(false);
  const { isWebDesktop } = getResponsiveValues();
  const layout = getWebLayout();

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: {
      new: {
        ...COMMON_SHORTCUTS.new,
        handler: () => setShowNewStoryForm(true),
      },
    },
    enabled: true,
  });

  const handleCreateStory = async () => {
    if (!newStoryTitle.trim()) {
      Alert.alert('Error', 'Please enter a story title');
      return;
    }

    const newStory: Story = {
      id: `story-${Date.now()}`,
      title: newStoryTitle,
      description: 'A new story',
      author: 'Author',
      startSceneId: 'scene_1',
      scenes: {
        scene_1: {
          id: 'scene_1',
          text: 'Your story begins here...',
          backgroundImageUri: undefined,
          characters: [],
          voiceAudioUri: undefined,
          choices: [],
          musicUri: undefined,
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await addStory(newStory);
      setNewStoryTitle('');
      setShowNewStoryForm(false);
      
      // Navigate to scene editor
      router.push({
        pathname: '../scene-editor',
        params: { storyId: newStory.id, sceneId: 'scene_1' },
      });
    } catch {
      Alert.alert('Error', 'Failed to create story');
    }
  };

  const handleEditStory = (story: Story) => {
    router.push({
      pathname: '../scene-editor',
      params: { storyId: story.id, sceneId: story.startSceneId },
    });
  };

  const handleOpenNodeEditor = (story: Story) => {
    router.push({
      pathname: '/node-editor',
      params: { storyId: story.id, sceneId: story.startSceneId },
    });
  };

  const handleDeleteStory = (storyId: string) => {
    Alert.alert('Delete Story', 'Are you sure you want to delete this story?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStory(storyId);
            Alert.alert('Success', 'Story deleted');
          } catch {
            Alert.alert('Error', 'Failed to delete story');
          }
        },
      },
    ]);
  };

  const renderStoryCard = ({ item }: { item: Story }) => (
    <HelpableElement helpId="story_list">
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: colors.foreground,
            }}
          >
            {item.title}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
            }}
          >
            {Object.keys(item.scenes).length} scenes
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button
              variant="primary"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => handleEditStory(item)}
            >
              ✏️ Edit
            </Button>
            <HelpableElement helpId="delete_story_button">
              <Button
                variant="danger"
                size="sm"
                onPress={() => handleDeleteStory(item.id)}
              >
                🗑
              </Button>
            </HelpableElement>
          </View>
        </View>
      </View>
    </HelpableElement>
  );

  const topBarActions = isWebDesktop ? (
    <>
      <TopBarAction
        icon="+"
        label="New Story"
        onPress={() => setShowNewStoryForm(!showNewStoryForm)}
        shortcut="Ctrl+N"
        variant="primary"
      />
    </>
  ) : null;

  return (
    <DesktopLayout
      showSidebar={isWebDesktop}
      showTopBar={isWebDesktop}
      topBarTitle="Story Editor"
      topBarActions={topBarActions}
    >
      <ScreenContainer className="p-4">
        {/* Help System Components */}
        <HelpTooltip />
        <GuidedTourOverlay />
        <FirstTimeGuide />

        {/* Mobile/Tablet Header - only show when not desktop */}
        {!isWebDesktop && (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontSize: 28,
                fontWeight: '700',
                color: colors.foreground,
              }}
            >
              Editor
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <HelpModeToggle />
              <HelpableElement helpId="add_story_button">
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => setShowNewStoryForm(!showNewStoryForm)}
                >
                  {showNewStoryForm ? 'Cancel' : '+ New'}
                </Button>
              </HelpableElement>
            </View>
          </View>
        )}

      {showNewStoryForm && (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 8,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: colors.foreground,
            }}
          >
            Story Title
          </Text>
          <TextInput
            style={{
              backgroundColor: colors.background,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              color: colors.foreground,
              fontSize: 14,
            }}
            placeholder="Enter story title"
            placeholderTextColor={colors.muted}
            value={newStoryTitle}
            onChangeText={setNewStoryTitle}
          />
          <HelpableElement helpId="add_story_button">
            <Button
              variant="primary"
              size="base"
              fullWidth
              onPress={handleCreateStory}
            >
              Create Story
            </Button>
          </HelpableElement>
        </View>
      )}

      {stories.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              color: colors.muted,
              textAlign: 'center',
            }}
          >
            No stories yet. Create one to get started!
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: isWebDesktop ? 'row' : 'column',
            flexWrap: isWebDesktop ? 'wrap' : 'nowrap',
            gap: 12,
          }}
        >
          {stories.map((item) => (
            <View
              key={item.id}
              style={{
                width: isWebDesktop
                  ? layout.gridColumns === 3
                    ? 'calc(33.333% - 8px)'
                    : 'calc(50% - 6px)'
                  : '100%',
              }}
            >
              {renderStoryCard({ item })}
            </View>
          ))}
        </View>
      )}
    </ScreenContainer>
    </DesktopLayout>
  );
}
