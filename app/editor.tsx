/**
 * app/editor.tsx — Project Editor Main Screen
 *
 * Shows project metadata (title, description, tags) and scenes list.
 * User can create/edit/delete scenes, navigate to scene editor or story flow.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useStoryState, useStoryActions } from '@/lib/story-hooks';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { StoryMetadata } from '@/lib/story-domain';
import { Button } from '@/components/ui';

export default function EditorScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const { storiesMetadata } = useStoryState();
  const { createStory, deleteStory } = useStoryActions();

  const [showNewStoryForm, setShowNewStoryForm] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState('');

  const handleCreateStory = useCallback(async () => {
    if (!newStoryTitle.trim()) {
      Alert.alert(t('common.error'), t('editor.pleaseEnterTitle'));
      return;
    }

    try {
      const created = createStory(newStoryTitle.trim());
      setNewStoryTitle('');
      setShowNewStoryForm(false);
      // Navigate to scene editor
      router.push({
        pathname: '/scene-editor',
        params: { storyId: created.storyId, sceneId: created.sceneId },
      } as never);
    } catch {
      Alert.alert(t('common.error'), t('editor.createFailed'));
    }
  }, [newStoryTitle, createStory, router, t]);

  const handleEditStory = useCallback((story: StoryMetadata) => {
    // Open scene manager instead of directly opening editor
    router.push({
      pathname: '/scene-manager',
      params: { storyId: story.id },
    } as never);
  }, [router]);

  const handleStoryFlow = useCallback((storyId: string) => {
    router.push({ pathname: '/story-flow', params: { storyId } } as never);
  }, [router]);

  const handleDeleteStory = useCallback((storyId: string) => {
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStory(storyId);
          } catch {
            Alert.alert(t('common.error'), 'Failed to delete story');
          }
        },
      },
    ]);
  }, [deleteStory, t]);

  return (
    <ScreenContainer>
      <View style={{ padding: 16 }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.foreground }}>
            {t('editor.title')}
          </Text>
          <Button
            variant="primary"
            size="sm"
            onPress={() => setShowNewStoryForm(!showNewStoryForm)}
          >
            {showNewStoryForm ? t('common.cancel') : '+ New Story'}
          </Button>
        </View>

        {/* New story form */}
        {showNewStoryForm && (
          <View style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground, marginBottom: 8 }}>
              {t('editor.pleaseEnterTitle')}
            </Text>
            <TextInput
              value={newStoryTitle}
              onChangeText={setNewStoryTitle}
              placeholder="Story title..."
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: colors.foreground,
                marginBottom: 8,
              }}
            />
            <Button variant="primary" size="base" onPress={handleCreateStory}>
              {t('home.createStory')}
            </Button>
          </View>
        )}

        {/* Stories list */}
        {storiesMetadata.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 16 }}>
              No stories yet. Create your first story!
            </Text>
          </View>
        ) : (
          <ScrollView>
            {storiesMetadata.map((story) => (
              <View
                key={story.id}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>
                  {story.title}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {story.sceneCount} scenes · Updated {new Date(story.updatedAt).toLocaleDateString()}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={() => handleEditStory(story)}
                  >
                    ✏️ Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => handleStoryFlow(story.id)}
                  >
                    🗺 Flow
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push({ pathname: '/play', params: { storyId: story.id } } as never)}
                  >
                    ▶ Play
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => handleDeleteStory(story.id)}
                  >
                    🗑 Delete
                  </Button>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </ScreenContainer>
  );
}
