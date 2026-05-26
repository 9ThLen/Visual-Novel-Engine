import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { navigateWithViewTransition } from '@/lib/navigation-transition';
import { useStoryActions, useStoryState } from '@/lib/story-hooks';
import { StoryMetadata } from '@/lib/story-domain';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export default function EditorScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colors = useColors();
  const { t } = useI18n();
  const { storiesMetadata } = useStoryState();
  const { createStory, deleteStory } = useStoryActions();

  const [showNewStoryForm, setShowNewStoryForm] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState('');

  const storyColumns = useMemo(() => {
    if (Platform.OS !== 'web') return 1;
    if (width >= 1040) return 2;
    return 1;
  }, [width]);

  const totalScenes = useMemo(
    () => storiesMetadata.reduce((sum, story) => sum + (story.sceneCount ?? 0), 0),
    [storiesMetadata],
  );

  const handleCreateStory = useCallback(async () => {
    if (!newStoryTitle.trim()) {
      Alert.alert(t('common.error'), t('editor.pleaseEnterTitle'));
      return;
    }

    try {
      const created = createStory(newStoryTitle.trim());
      setNewStoryTitle('');
      setShowNewStoryForm(false);
      navigateWithViewTransition(() => router.push({
        pathname: '/scene-editor',
        params: { storyId: created.storyId, sceneId: created.sceneId },
      } as never));
    } catch {
      Alert.alert(t('common.error'), t('editor.createFailed'));
    }
  }, [newStoryTitle, createStory, router, t]);

  const handleEditStory = useCallback((story: StoryMetadata) => {
    navigateWithViewTransition(() => router.push({
      pathname: '/scene-manager',
      params: { storyId: story.id },
    } as never));
  }, [router]);

  const handleStoryFlow = useCallback((storyId: string) => {
    navigateWithViewTransition(() => router.push({ pathname: '/story-flow', params: { storyId } } as never));
  }, [router]);

  const handleManuscript = useCallback((storyId: string) => {
    navigateWithViewTransition(() => router.push({ pathname: '/manuscript-editor', params: { storyId } } as never));
  }, [router]);

  const handlePlay = useCallback((storyId: string) => {
    navigateWithViewTransition(() => router.push({ pathname: '/play', params: { storyId } } as never));
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
            Alert.alert(t('common.error'), 'Delete failed. Try again.');
          }
        },
      },
    ]);
  }, [deleteStory, t]);

  return (
    <ScreenContainer className="px-4 py-5" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, Platform.OS === 'web' && styles.webContent]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>Creator Workspace</Text>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>{t('editor.title')}</Text>
            <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
              Manage stories, open scene tools, and jump into playtesting from one focused dashboard.
            </Text>
          </View>
          <Button
            variant="primary"
            size="base"
            onPress={() => setShowNewStoryForm(!showNewStoryForm)}
            accessibilityLabel={showNewStoryForm ? t('common.cancel') : 'Create New Story'}
          >
            {showNewStoryForm ? t('common.cancel') : 'Create New Story'}
          </Button>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{storiesMetadata.length}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Stories</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{totalScenes}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Scenes</Text>
            </View>
          </View>
        </View>

        {showNewStoryForm && (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.foreground }]}>
              {t('editor.pleaseEnterTitle')}
            </Text>
            <TextInput
              value={newStoryTitle}
              onChangeText={setNewStoryTitle}
              placeholder="Story title…"
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('editor.pleaseEnterTitle')}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            <Button variant="primary" size="base" onPress={handleCreateStory}>
              {t('home.createStory')}
            </Button>
          </View>
        )}

        {storiesMetadata.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Stories Yet</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Create a story, then add scenes and connect them into a playable flow.
            </Text>
            <Button variant="primary" size="base" onPress={() => setShowNewStoryForm(true)}>
              Create First Story
            </Button>
          </View>
        ) : (
          <View style={storyColumns > 1 ? styles.storyGrid : styles.storyStack}>
            {storiesMetadata.map((story) => (
              <View
                key={story.id}
                style={[
                  styles.storyCard,
                  storyColumns > 1 && styles.storyCardGrid,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.storyTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {story.title}
                </Text>
                <Text style={[styles.storyMeta, { color: colors.muted }]}>
                  {story.sceneCount} scenes · Updated {dateFormatter.format(new Date(story.updatedAt))}
                </Text>

                <View style={styles.actionRow}>
                  <Button variant="primary" size="sm" onPress={() => handleEditStory(story)}>
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onPress={() => handleStoryFlow(story.id)}>
                    Flow
                  </Button>
                  <Button variant="secondary" size="sm" onPress={() => handleManuscript(story.id)}>
                    Manuscript
                  </Button>
                  <Button variant="secondary" size="sm" onPress={() => handlePlay(story.id)}>
                    Play
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => handleDeleteStory(story.id)}>
                    Delete
                  </Button>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingBottom: 28,
  },
  webContent: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
  },
  hero: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 18,
  },
  heroCopy: {
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    maxWidth: 620,
    fontSize: 15,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    minWidth: 104,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  emptyText: {
    maxWidth: 420,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  storyStack: {
    gap: 12,
  },
  storyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  storyCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  storyCardGrid: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  storyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  storyMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
