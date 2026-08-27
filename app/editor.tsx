/**
 * app/editor.tsx — the studio's shelf of projects.
 *
 * This is the author's lobby, so it answers exactly three questions and no
 * others: what was I working on, what needs work, and how do I start something
 * new. Everything else about a story lives on its project page, and this screen
 * deliberately does not repeat it.
 *
 * All of the arithmetic — size, status, order, search — lives in
 * `lib/editor/story-library.ts`, which is pure and tested; the screen only
 * renders what it returns.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/screen-container';
import { EditorStoryCard } from '@/components/editor/EditorStoryCard';
import { AppModal, ConfirmDialog, IconSymbol } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import {
  TOOLBAR_MIN_PROJECTS,
  buildStudioProjects,
  filterStudioProjects,
  shouldFeatureFirst,
  sortStudioProjects,
  summarizeStudioLibrary,
  type StudioProject,
  type StudioSort,
} from '@/lib/editor/story-library';
import { navigateWithViewTransition } from '@/lib/navigation-transition';
import { exportStory, importStory } from '@/lib/story-hooks';
import { saveStoryExport } from '@/lib/export-story-file';
import { previewStoryArchive } from '@/lib/story-backup/archive';
import { importStoryArchive } from '@/lib/story-backup/import';
import {
  pickStoryImportFile,
  type PickedStoryImportFile,
} from '@/lib/story-backup/platform-file';
import type { StoryArchivePreview } from '@/lib/story-backup/types';
import { showToast } from '@/lib/toast-store';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { useAppStore } from '@/stores/use-app-store';

const CONTENT_MAX_WIDTH = 1440;
const GUTTER = spacing.xl;
const CARD_GAP = spacing.lg;

const SORTS: StudioSort[] = ['recent', 'title', 'size'];
const SORT_LABEL_KEYS: Record<StudioSort, string> = {
  recent: 'editor.sortRecent',
  title: 'editor.sortTitle',
  size: 'editor.sortSize',
};

function columnsForWidth(width: number): number {
  if (width >= 1640) return 4;
  if (width >= 1200) return 3;
  if (width >= 760) return 2;
  return 1;
}

export default function EditorScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colors = useColors();
  const { t, pluralize } = useI18n();

  const storiesMetadata = useAppStore((state) => state.storiesMetadata);
  const sceneRecordsByStory = useAppStore((state) => state.sceneRecordsByStory);
  const sceneRecordHydration = useAppStore((state) => state.sceneRecordHydration);
  const lastEditedSceneByStory = useAppStore((state) => state.lastEditedSceneByStory);
  const isLoaded = useAppStore((state) => state.isLoaded);
  const hydrateSceneRecordsForStory = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const createStory = useAppStore((state) => state.createStory);
  const deleteStory = useAppStore((state) => state.deleteStory);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<StudioSort>('recent');
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [menuProject, setMenuProject] = useState<StudioProject | null>(null);
  const [storyIdToDelete, setStoryIdToDelete] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pendingBackup, setPendingBackup] =
    useState<Extract<PickedStoryImportFile, { kind: 'backup' }> | null>(null);
  const [backupPreview, setBackupPreview] = useState<StoryArchivePreview | null>(null);
  const titleInputRef = useRef<TextInput | null>(null);

  // «Edited 2 hours ago» is only true while the screen is open, and the wide
  // card's eligibility ages out. Re-stamping on focus keeps both honest without
  // a ticking timer.
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
    }, []),
  );

  // Status and word counts are a lie until a story's scenes are all in memory,
  // and the persisted hydration flags do not survive a reload. This is a no-op
  // for anything already loaded.
  const [settledStoryIds, setSettledStoryIds] = useState<Record<string, true>>({});
  useEffect(() => {
    if (!isLoaded) return;
    for (const story of storiesMetadata) {
      if (sceneRecordHydration[story.id] === 'full') continue;
      const storyId = story.id;
      void hydrateSceneRecordsForStory(storyId)
        .catch(() => {})
        .finally(() => {
          setSettledStoryIds((current) => (current[storyId] ? current : { ...current, [storyId]: true }));
        });
    }
  }, [hydrateSceneRecordsForStory, isLoaded, sceneRecordHydration, storiesMetadata]);

  // A story with no scenes stored anywhere never gets the `full` flag — there is
  // nothing to load, so the store leaves it alone. Having asked and been given
  // nothing is still an answer, and the shelf should stop waiting for it.
  const hydration = useMemo(() => {
    const merged: Record<string, 'full' | 'window'> = { ...sceneRecordHydration };
    for (const storyId of Object.keys(settledStoryIds)) {
      if (!merged[storyId]) merged[storyId] = 'full';
    }
    return merged;
  }, [sceneRecordHydration, settledStoryIds]);

  const projects = useMemo(
    () =>
      buildStudioProjects({
        storiesMetadata,
        sceneRecordsByStory,
        sceneRecordHydration: hydration,
        lastEditedSceneByStory,
      }),
    [hydration, lastEditedSceneByStory, sceneRecordsByStory, storiesMetadata],
  );

  const visibleProjects = useMemo(
    () => sortStudioProjects(filterStudioProjects(projects, query), sort),
    [projects, query, sort],
  );

  const summary = useMemo(() => summarizeStudioLibrary(projects), [projects]);
  const columns = columnsForWidth(width);
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH) - GUTTER * 2;
  const cardWidth = Math.max(220, (contentWidth - CARD_GAP * (columns - 1)) / columns);
  // «Continue» is the point of the featured card, so it survives a single
  // column; only the two-column spread needs the room.
  const featureFirst = !query.trim() && shouldFeatureFirst(visibleProjects, sort, now);

  const openStory = useCallback(
    (storyId: string) => {
      navigateWithViewTransition(() =>
        router.push({ pathname: '/story-home', params: { storyId } }),
      );
    },
    [router],
  );

  const continueStory = useCallback(
    (project: StudioProject) => {
      navigateWithViewTransition(() =>
        router.push({
          pathname: '/document-editor',
          params: { storyId: project.id, sceneId: project.resumeSceneId },
        }),
      );
    },
    [router],
  );

  const handleCreateStory = useCallback(() => {
    const title = (draftTitle ?? '').trim();
    if (!title) {
      showToast(t('editor.pleaseEnterTitle'), 'error');
      return;
    }
    try {
      const created = createStory(title);
      setDraftTitle(null);
      navigateWithViewTransition(() =>
        router.push({
          pathname: '/document-editor',
          params: { storyId: created.storyId, sceneId: created.sceneId },
        }),
      );
    } catch {
      showToast(t('editor.createFailed'), 'error');
    }
  }, [createStory, draftTitle, router, t]);

  const handleImport = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    try {
      const picked = await pickStoryImportFile();
      if (!picked) return;
      if (picked.kind === 'json') {
        const imported = await importStory(picked.text);
        showToast(t('editor.importSuccess'), 'success');
        navigateWithViewTransition(() =>
          router.push({ pathname: '/story-home', params: { storyId: imported.id } }),
        );
      } else {
        const preview = await previewStoryArchive(picked.source);
        setPendingBackup(picked);
        setBackupPreview(preview);
      }
    } catch {
      showToast(t('editor.importFailed'), 'error');
    } finally {
      setImporting(false);
    }
  }, [importing, router, t]);

  const confirmBackupImport = useCallback(async () => {
    if (!pendingBackup || importing) return;
    setImporting(true);
    try {
      const imported = await importStoryArchive(pendingBackup.source);
      setPendingBackup(null);
      setBackupPreview(null);
      showToast(t('editor.fullImportSuccess'), 'success');
      navigateWithViewTransition(() =>
        router.push({ pathname: '/story-home', params: { storyId: imported.storyId } }),
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('editor.importFailed'), 'error');
    } finally {
      setImporting(false);
    }
  }, [pendingBackup, importing, router, t]);

  const backupPreviewMessage = useMemo(() => {
    if (!backupPreview) return '';
    const kinds = Object.entries(backupPreview.mediaKinds)
      .map(([kind, count]) => `${kind}: ${count}`)
      .join(', ');
    return t('editor.backupPreview', {
      title: backupPreview.story.title,
      author: backupPreview.story.author || t('editor.unknownAuthor'),
      scenes: backupPreview.counts.scenes,
      characters: backupPreview.counts.characters,
      assets: backupPreview.counts.embeddedAssets,
      size: backupPreview.counts.totalAssetBytes.toLocaleString(),
      kinds: kinds || '—',
    });
  }, [backupPreview, t]);

  const handleExport = useCallback(
    async (project: StudioProject) => {
      try {
        await hydrateSceneRecordsForStory(project.id);
        const json = await exportStory(project.id, useAppStore.getState());
        await saveStoryExport(project.title, json);
        showToast(t('storyHome.exportSuccess'), 'success');
      } catch {
        showToast(t('storyHome.exportFailed'), 'error');
      }
    },
    [hydrateSceneRecordsForStory, t],
  );

  const confirmDeleteStory = useCallback(() => {
    if (!storyIdToDelete) return;
    try {
      deleteStory(storyIdToDelete);
      setStoryIdToDelete(null);
      showToast(t('editor.deleteSuccess'), 'success');
    } catch {
      showToast(t('editor.deleteFailed'), 'error');
    }
  }, [deleteStory, storyIdToDelete, t]);

  const summaryText = t('editor.librarySummary', {
    stories: summary.stories,
    storiesLabel: pluralize(
      summary.stories,
      t('editor.storyOne'),
      t('editor.storyFew'),
      t('editor.storyMany'),
    ),
    scenes: summary.scenes,
    scenesLabel: pluralize(
      summary.scenes,
      t('editor.sceneOne'),
      t('editor.sceneFew'),
      t('editor.sceneMany'),
    ),
  });

  const showToolbar = projects.length >= TOOLBAR_MIN_PROJECTS;

  return (
    <ScreenContainer edges={['top', 'left', 'right', 'bottom']}>
      <View style={[styles.nav, { borderBottomColor: colors['border-subtle'] }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/tabs'))}
          accessibilityRole="button"
          accessibilityLabel={t('editor.backToLibrary')}
          style={({ pressed }) => [styles.navBack, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.navBackText, { color: colors.primary }]}>
            {t('editor.backToLibrary')}
          </Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>
          {t('editor.studioTitle')}
        </Text>
        <View style={styles.navEnd}>
          <Pressable
            onPress={() => {
              // The create tile is a cell of the grid, so a search that hides
              // the grid would swallow this press. Clear it first.
              setQuery('');
              setDraftTitle('');
              requestAnimationFrame(() => titleInputRef.current?.focus());
            }}
            accessibilityRole="button"
            accessibilityLabel={t('editor.newStoryTile')}
            style={({ pressed }) => [
              styles.navPlus,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <IconSymbol name="add" size={20} color={colors['foreground-on-primary']} />
          </Pressable>
        </View>
      </View>

      {!isLoaded ? (
        // Stories arrive from IndexedDB a beat after the first paint, and
        // «No stories yet» is a frightening thing to flash at someone who has
        // twenty of them.
        <View style={styles.booting}>
          <Text style={[styles.bootingText, { color: colors['foreground-tertiary'] }]}>
            {t('home.preparingLibrary')}
          </Text>
        </View>
      ) : (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          {projects.length === 0 ? (
            draftTitle === null ? (
              <EmptyShelf
                onCreate={() => setDraftTitle('')}
                onImport={handleImport}
                importing={importing}
              />
            ) : (
              <View style={styles.emptyDraft}>
                <NewStoryTile
                  draftTitle={draftTitle}
                  inputRef={titleInputRef}
                  onStart={() => setDraftTitle('')}
                  onChange={setDraftTitle}
                  onCancel={() => setDraftTitle(null)}
                  onSubmit={handleCreateStory}
                />
              </View>
            )
          ) : (
            <>
              <View style={styles.sectionLine}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {t('editor.yourStories')}
                </Text>
                <Text style={[styles.sectionSummary, { color: colors['foreground-tertiary'] }]}>
                  {summaryText}
                </Text>
              </View>

              {showToolbar ? (
                <View style={styles.toolbar}>
                  <View
                    style={[
                      styles.search,
                      { backgroundColor: colors.surface, borderColor: colors['border-subtle'] },
                    ]}
                  >
                    <IconSymbol name="search" size={17} color={colors['foreground-tertiary']} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder={t('editor.searchPlaceholder')}
                      placeholderTextColor={colors['foreground-tertiary']}
                      accessibilityLabel={t('editor.searchLabel')}
                      style={[styles.searchInput, { color: colors.foreground }]}
                    />
                    {query ? (
                      <Pressable
                        onPress={() => setQuery('')}
                        accessibilityRole="button"
                        accessibilityLabel={t('editor.clearSearch')}
                        hitSlop={8}
                      >
                        <IconSymbol name="xmark" size={16} color={colors['foreground-tertiary']} />
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={[styles.sortGroup, { backgroundColor: colors['surface-2'] }]}>
                    {SORTS.map((option) => {
                      const active = option === sort;
                      return (
                        <Pressable
                          key={option}
                          onPress={() => setSort(option)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${t('editor.sortLabel')}: ${t(SORT_LABEL_KEYS[option])}`}
                          style={[
                            styles.sortOption,
                            active ? { backgroundColor: colors.surface } : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.sortText,
                              { color: active ? colors.foreground : colors['foreground-tertiary'] },
                            ]}
                          >
                            {t(SORT_LABEL_KEYS[option])}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {visibleProjects.length === 0 ? (
                <View style={[styles.noMatches, { borderColor: colors['border-subtle'] }]}>
                  <Text style={[styles.noMatchesTitle, { color: colors.foreground }]}>
                    {t('editor.noMatchesTitle', { query: query.trim() })}
                  </Text>
                  <Text style={[styles.noMatchesHint, { color: colors['foreground-tertiary'] }]}>
                    {t('editor.noMatchesHint')}
                  </Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {visibleProjects.map((project, index) => {
                    const isFeatured = featureFirst && index === 0;
                    const isSpread = isFeatured && columns > 1;
                    return (
                      <View
                        key={project.id}
                        style={{
                          width: isSpread ? cardWidth * 2 + CARD_GAP : cardWidth,
                        }}
                      >
                        <EditorStoryCard
                          project={project}
                          featured={isFeatured}
                          wide={isSpread}
                          now={now}
                          onOpen={openStory}
                          onContinue={continueStory}
                          onMenu={setMenuProject}
                        />
                      </View>
                    );
                  })}

                  <View style={{ width: cardWidth }}>
                    <NewStoryTile
                      draftTitle={draftTitle}
                      inputRef={titleInputRef}
                      onStart={() => setDraftTitle('')}
                      onChange={setDraftTitle}
                      onCancel={() => setDraftTitle(null)}
                      onSubmit={handleCreateStory}
                    />
                  </View>
                </View>
              )}

              <Pressable
                onPress={handleImport}
                disabled={importing}
                accessibilityRole="button"
                accessibilityLabel={t('editor.import')}
                style={({ pressed }) => [styles.importRow, { opacity: pressed || importing ? 0.6 : 1 }]}
              >
                <Text style={[styles.importText, { color: colors['foreground-tertiary'] }]}>
                  {t('editor.importPrompt')}{' '}
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>
                    {t('editor.import')}
                  </Text>
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
      )}

      <ProjectMenu
        project={menuProject}
        onClose={() => setMenuProject(null)}
        onContinue={(project) => {
          setMenuProject(null);
          continueStory(project);
        }}
        onOverview={(project) => {
          setMenuProject(null);
          openStory(project.id);
        }}
        onPreview={(project) => {
          setMenuProject(null);
          navigateWithViewTransition(() =>
            router.push({
              pathname: '/preview',
              params: { storyId: project.id, sceneId: project.startSceneId },
            }),
          );
        }}
        onExport={(project) => {
          setMenuProject(null);
          void handleExport(project);
        }}
        onDelete={(project) => {
          setMenuProject(null);
          setStoryIdToDelete(project.id);
        }}
      />

      <ConfirmDialog
        visible={pendingBackup !== null && backupPreview !== null}
        title={t('editor.importBackupTitle')}
        message={backupPreviewMessage}
        confirmLabel={t('editor.importAsNewStory')}
        onConfirm={confirmBackupImport}
        onCancel={() => {
          if (importing) return;
          setPendingBackup(null);
          setBackupPreview(null);
        }}
      />
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

/**
 * The create affordance is a cell of the grid, and the field opens inside it —
 * nothing above or below moves, so the shelf never jumps while you name a story.
 */
function NewStoryTile({
  draftTitle,
  inputRef,
  onStart,
  onChange,
  onCancel,
  onSubmit,
}: {
  draftTitle: string | null;
  inputRef: React.MutableRefObject<TextInput | null>;
  onStart: () => void;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();

  if (draftTitle === null) {
    return (
      <Pressable
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel={t('editor.newStoryTile')}
        style={({ pressed }) => [
          styles.newTile,
          {
            borderColor: colors.border,
            backgroundColor: pressed ? withAlpha(colors.primary, 0.06) : 'transparent',
          },
        ]}
      >
        <IconSymbol name="add" size={22} color={colors['foreground-tertiary']} />
        <Text style={[styles.newTileLabel, { color: colors['foreground-tertiary'] }]}>
          {t('editor.newStoryTile')}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.newTile, { borderColor: colors.primary, borderStyle: 'solid' }]}>
      <TextInput
        ref={inputRef}
        value={draftTitle}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        onKeyPress={(event) => {
          if (event.nativeEvent.key === 'Escape') onCancel();
        }}
        autoFocus
        returnKeyType="done"
        placeholder={t('editor.storyTitlePlaceholder')}
        placeholderTextColor={colors['foreground-tertiary']}
        accessibilityLabel={t('editor.pleaseEnterTitle')}
        style={[
          styles.newTileInput,
          {
            backgroundColor: colors.surface,
            borderColor: colors.primary,
            color: colors.foreground,
          },
        ]}
      />
      <Text style={[styles.newTileHint, { color: colors['foreground-tertiary'] }]}>
        {t('editor.newStoryHint')}
      </Text>
    </View>
  );
}

function EmptyShelf({
  onCreate,
  onImport,
  importing,
}: {
  onCreate: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors['border-subtle'] }]}>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('home.noStories')}</Text>
      <Text style={[styles.emptyHint, { color: colors['foreground-tertiary'] }]}>
        {t('editor.emptyWorkspaceHint')}
      </Text>
      <View style={styles.emptyActions}>
        <Pressable
          onPress={onCreate}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primaryAction,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.primaryActionText, { color: colors['foreground-on-primary'] }]}>
            {t('editor.createFirstStory')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onImport}
          disabled={importing}
          accessibilityRole="button"
          style={({ pressed }) => [styles.ghostAction, { borderColor: colors.border, opacity: pressed || importing ? 0.6 : 1 }]}
        >
          <Text style={[styles.ghostActionText, { color: colors.foreground }]}>
            {t('editor.import')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * One sheet for the whole shelf rather than a menu per card — and the only place
 * «Delete» appears, so it can never be the neighbour of a tap you make daily.
 */
function ProjectMenu({
  project,
  onClose,
  onContinue,
  onOverview,
  onPreview,
  onExport,
  onDelete,
}: {
  project: StudioProject | null;
  onClose: () => void;
  onContinue: (project: StudioProject) => void;
  onOverview: (project: StudioProject) => void;
  onPreview: (project: StudioProject) => void;
  onExport: (project: StudioProject) => void;
  onDelete: (project: StudioProject) => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  if (!project) return null;

  const rows: { key: string; label: string; icon: 'editor' | 'document' | 'preview' | 'save' | 'delete'; danger?: boolean; onPress: () => void }[] = [
    { key: 'continue', label: t('editor.continueEditing'), icon: 'editor', onPress: () => onContinue(project) },
    { key: 'overview', label: t('editor.projectOverview'), icon: 'document', onPress: () => onOverview(project) },
    { key: 'preview', label: t('editor.actionPreview'), icon: 'preview', onPress: () => onPreview(project) },
    { key: 'export', label: t('editor.actionExport'), icon: 'save', onPress: () => onExport(project) },
    { key: 'delete', label: t('common.delete'), icon: 'delete', danger: true, onPress: () => onDelete(project) },
  ];

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.menuBackdrop}>
        {/* A sibling, not a parent: a Pressable wrapping the sheet would nest
            the rows inside another button, which is invalid HTML on web. */}
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={[styles.menuSheet, { backgroundColor: colors['surface-container'] }]}>
          <Text style={[styles.menuTitle, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
            {project.title}
          </Text>
          {rows.map((row, index) => (
            <React.Fragment key={row.key}>
              {index > 0 ? (
                <View style={[styles.menuSeparator, { backgroundColor: colors['border-subtle'] }]} />
              ) : null}
              <Pressable
                onPress={row.onPress}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.menuRow,
                  pressed ? { backgroundColor: colors.hover } : null,
                ]}
              >
                <IconSymbol
                  name={row.icon}
                  size={19}
                  color={row.danger ? colors.danger : colors['foreground-secondary']}
                />
                <Text
                  style={[
                    styles.menuRowText,
                    { color: row.danger ? colors.danger : colors.foreground },
                  ]}
                >
                  {row.label}
                </Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 110,
  },
  navBackText: {
    ...typeScale.label,
    fontWeight: '600',
  },
  navTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  navEnd: {
    minWidth: 110,
    alignItems: 'flex-end',
  },
  navPlus: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  booting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  bootingText: {
    ...typeScale.label,
    fontWeight: '400',
  },
  content: {
    paddingBottom: spacing['2xl'],
  },
  inner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: GUTTER,
    gap: spacing.lg,
  },
  sectionLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
  },
  sectionSummary: {
    ...typeScale.caption,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  search: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: typeScale.label.fontSize,
    lineHeight: typeScale.label.lineHeight,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  sortGroup: {
    flexDirection: 'row',
    height: 38,
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  sortOption: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  sortText: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  newTile: {
    minHeight: 208,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  newTileLabel: {
    ...typeScale.label,
    fontWeight: '700',
  },
  newTileInput: {
    width: '100%',
    height: 40,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    fontSize: typeScale.label.fontSize,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  newTileHint: {
    ...typeScale.caption,
    textAlign: 'center',
  },
  importRow: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  importText: {
    ...typeScale.caption,
  },
  noMatches: {
    borderWidth: 1,
    borderRadius: radius.xl,
    borderStyle: 'dashed',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  noMatchesTitle: {
    ...typeScale.label,
    fontWeight: '700',
  },
  noMatchesHint: {
    ...typeScale.caption,
    textAlign: 'center',
  },
  empty: {
    marginTop: spacing['2xl'],
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyTitle: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyHint: {
    maxWidth: 420,
    textAlign: 'center',
    ...typeScale.label,
    fontWeight: '400',
  },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  primaryAction: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
  primaryActionText: {
    ...typeScale.label,
    fontWeight: '800',
  },
  ghostAction: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  ghostActionText: {
    ...typeScale.label,
    fontWeight: '700',
  },
  menuBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyDraft: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginTop: spacing['2xl'],
  },
  menuSheet: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
  menuTitle: {
    ...typeScale.caption,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  menuSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 44,
    paddingHorizontal: spacing.lg,
  },
  menuRowText: {
    ...typeScale.label,
    fontWeight: '600',
  },
});
