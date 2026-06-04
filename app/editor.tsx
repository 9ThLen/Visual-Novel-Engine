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
import type { SceneRecord } from '@/lib/engine/types';
import { showToast } from '@/lib/toast-store';
import { radius, spacing, typeScale } from '@/lib/design-tokens';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function getPaperEditorSceneId(
  story: StoryMetadata,
  scenesById: Record<string, SceneRecord> | undefined,
): string | null {
  if (story.startSceneId && scenesById?.[story.startSceneId]) {
    return story.startSceneId;
  }
  const scenes = Object.values(scenesById ?? {});
  return scenes.find((scene) => scene.isStart)?.id ?? scenes[0]?.id ?? null;
}

export default function EditorScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colors = useColors();
  const { t } = useI18n();
  const { storiesMetadata, sceneRecordsByStory } = useStoryState();
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
      showToast(t('editor.pleaseEnterTitle'), 'error');
      return;
    }

    try {
      const created = createStory(newStoryTitle.trim());
      setNewStoryTitle('');
      setShowNewStoryForm(false);
      navigateWithViewTransition(() => router.push({
        pathname: '/document-editor',
        params: { storyId: created.storyId, sceneId: created.sceneId },
      }));
    } catch {
      showToast(t('editor.createFailed'), 'error');
    }
  }, [newStoryTitle, createStory, router, t]);

  const handleEditStory = useCallback((story: StoryMetadata) => {
    const sceneId = getPaperEditorSceneId(story, sceneRecordsByStory[story.id]);
    if (!sceneId) {
      showToast(t('document.invalidRoute'), 'error');
      return;
    }
    navigateWithViewTransition(() => router.push({
      pathname: '/document-editor',
      params: { storyId: story.id, sceneId },
    }));
  }, [router, sceneRecordsByStory, t]);

  const handlePlay = useCallback((storyId: string) => {
    navigateWithViewTransition(() => router.push({ pathname: '/play', params: { storyId } }));
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
            showToast(t('editor.deleteFailed'), 'error');
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
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{t('editor.creatorWorkspace')}</Text>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>{t('editor.title')}</Text>
            <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
              {t('editor.workspaceSubtitle')}
            </Text>
          </View>
          <Button
            variant="primary"
            size="base"
            onPress={() => setShowNewStoryForm(!showNewStoryForm)}
            accessibilityLabel={showNewStoryForm ? t('common.cancel') : t('editor.createNew')}
          >
            {showNewStoryForm ? t('common.cancel') : t('editor.createNew')}
          </Button>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{storiesMetadata.length}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{t('home.stories')}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{totalScenes}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{t('editor.scenes')}</Text>
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
              placeholder={t('editor.storyTitlePlaceholder')}
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
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('home.noStories')}</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {t('editor.emptyWorkspaceHint')}
            </Text>
            <Button variant="primary" size="base" onPress={() => setShowNewStoryForm(true)}>
              {t('editor.createFirstStory')}
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
                  {t('editor.sceneCount', { count: story.sceneCount })} · {t('common.updated')} {dateFormatter.format(new Date(story.updatedAt))}
                </Text>

                <View style={styles.actionRow}>
                  <Button variant="primary" size="sm" onPress={() => handleEditStory(story)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="secondary" size="sm" onPress={() => handlePlay(story.id)}>
                    {t('common.play')}
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => handleDeleteStory(story.id)}>
                    {t('common.delete')}
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
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  webContent: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
  },
  hero: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  eyebrow: {
    ...typeScale.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroTitle: {
    ...typeScale.pageTitle,
  },
  heroSubtitle: {
    maxWidth: 620,
    ...typeScale.body,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    minWidth: 104,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statValue: {
    fontSize: typeScale.sectionTitle.fontSize,
    lineHeight: typeScale.sectionTitle.lineHeight,
    fontWeight: '800',
  },
  statLabel: {
    ...typeScale.caption,
    marginTop: 2,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  formTitle: {
    fontSize: typeScale.label.fontSize,
    lineHeight: typeScale.label.lineHeight,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: typeScale.sectionTitle.fontSize,
    lineHeight: typeScale.sectionTitle.lineHeight,
    fontWeight: '800',
  },
  emptyText: {
    maxWidth: 420,
    textAlign: 'center',
    fontSize: typeScale.label.fontSize,
    lineHeight: typeScale.label.lineHeight,
  },
  storyStack: {
    gap: spacing.md,
  },
  storyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  storyCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  storyCardGrid: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  storyTitle: {
    fontSize: typeScale.sectionTitle.fontSize,
    lineHeight: typeScale.sectionTitle.lineHeight,
    fontWeight: '800',
  },
  storyMeta: {
    ...typeScale.caption,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
