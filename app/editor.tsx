import React, { useCallback, useMemo, useState } from 'react';
import {
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
import { EditorStoryCard } from '@/components/editor/EditorStoryCard';
import { Button, ConfirmDialog } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { navigateWithViewTransition } from '@/lib/navigation-transition';
import { StoryMetadata } from '@/lib/story-domain';
import { pickStoryFile } from '@/lib/pick-story-file';
import { importStory } from '@/lib/story-hooks';
import { showToast } from '@/lib/toast-store';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { useAppStore } from '@/stores/use-app-store';

export default function EditorScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colors = useColors();
  const { t } = useI18n();
  const storiesMetadata = useAppStore((state) => state.storiesMetadata);
  const createStory = useAppStore((state) => state.createStory);
  const deleteStory = useAppStore((state) => state.deleteStory);

  const [showNewStoryForm, setShowNewStoryForm] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [storyIdToDelete, setStoryIdToDelete] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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
    navigateWithViewTransition(() => router.push({
      pathname: '/story-home',
      params: { storyId: story.id },
    }));
  }, [router]);

  const handleImport = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    try {
      const json = await pickStoryFile();
      if (!json) return;
      const imported = await importStory(json);
      showToast(t('editor.importSuccess'), 'success');
      navigateWithViewTransition(() => router.push({
        pathname: '/story-home',
        params: { storyId: imported.id },
      }));
    } catch {
      showToast(t('editor.importFailed'), 'error');
    } finally {
      setImporting(false);
    }
  }, [importing, router, t]);

  const handleDeleteStory = useCallback((storyId: string) => {
    setStoryIdToDelete(storyId);
  }, []);

  const confirmDeleteStory = useCallback(() => {
    if (!storyIdToDelete) return;
    try {
      deleteStory(storyIdToDelete);
      setStoryIdToDelete(null);
    } catch {
      showToast(t('editor.deleteFailed'), 'error');
    }
  }, [deleteStory, storyIdToDelete, t]);

  return (
    <ScreenContainer className="px-4 py-5" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, Platform.OS === 'web' && styles.webContent]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: withAlpha(colors.primary, 0.06), borderColor: withAlpha(colors.primary, 0.22) },
          ]}
        >
          <View style={[styles.heroAccent, { backgroundColor: colors.primary }]} />
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{t('editor.creatorWorkspace')}</Text>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>{t('editor.title')}</Text>
            <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
              {t('editor.workspaceSubtitle')}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statPill, { backgroundColor: withAlpha(colors.foreground, 0.05) }]}>
              <View style={[styles.statDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{storiesMetadata.length}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{t('home.stories')}</Text>
            </View>
            <View style={[styles.statPill, { backgroundColor: withAlpha(colors.foreground, 0.05) }]}>
              <View style={[styles.statDot, { backgroundColor: colors.secondary }]} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{totalScenes}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{t('editor.scenes')}</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            <Button
              variant="primary"
              size="base"
              onPress={() => setShowNewStoryForm(!showNewStoryForm)}
              accessibilityLabel={showNewStoryForm ? t('common.cancel') : t('editor.createNew')}
            >
              {showNewStoryForm ? t('common.cancel') : t('editor.createNew')}
            </Button>
            <Button
              variant="secondary"
              size="base"
              onPress={handleImport}
              disabled={importing}
              accessibilityLabel={t('editor.import')}
            >
              {t('editor.import')}
            </Button>
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
          <View style={styles.librarySection}>
            <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
              {t('editor.yourStories')}
            </Text>
            <View style={storyColumns > 1 ? styles.storyGrid : styles.storyStack}>
              {storiesMetadata.map((story) => (
                <View key={story.id} style={storyColumns > 1 ? styles.storyCardGrid : undefined}>
                  <EditorStoryCard
                    story={story}
                    onEdit={handleEditStory}
                    onDelete={handleDeleteStory}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
      <ConfirmDialog
        visible={storyIdToDelete !== null}
        title={t('editor.deleteTitle')}
        message={t('editor.deleteConfirm')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDeleteStory}
        onCancel={() => setStoryIdToDelete(null)}
        destructive
      />
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
    paddingLeft: spacing.xl + spacing.xs,
    gap: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  heroAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  statDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  statValue: {
    fontSize: typeScale.label.fontSize,
    lineHeight: typeScale.label.lineHeight,
    fontWeight: '800',
  },
  statLabel: {
    ...typeScale.caption,
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
  librarySection: {
    gap: spacing.md,
  },
  sectionHeading: {
    fontSize: typeScale.sectionTitle.fontSize,
    lineHeight: typeScale.sectionTitle.lineHeight,
    fontWeight: '800',
  },
  storyStack: {
    gap: spacing.md,
  },
  storyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  storyCardGrid: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 280,
  },
});
