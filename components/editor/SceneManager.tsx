import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ConfirmDialog } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { computeOrphanedByDeletion } from '@/lib/document-editor/branch-actions';
import { createSceneRecordFromEditorDraft } from '@/lib/editor-scene-draft';
import type { BlockType, SceneRecord } from '@/lib/engine/types';
import { generateId } from '@/lib/id-utils';
import { navigateWithViewTransition } from '@/lib/navigation-transition';
import { selectSceneRecordMapForStory, useAppStore } from '@/stores/use-app-store';
import { SceneGraphView } from './SceneGraphView';
import { SceneSelector } from './SceneSelector';

type SceneManagerViewMode = 'list' | 'graph';

interface SceneManagerProps {
  storyId: string;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function createManagedSceneRecord(
  storyId: string,
  sceneId: string,
  sceneName: string,
  flowX: number,
  flowY: number,
): SceneRecord {
  return {
    ...createSceneRecordFromEditorDraft(storyId, {
      sceneId,
      sceneName,
      timeline: [],
    }),
    flowX,
    flowY,
  };
}

export function SceneManager({ storyId }: SceneManagerProps) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const storiesMetadata = useAppStore((state) => state.storiesMetadata);
  const saveSceneRecord = useAppStore((state) => state.saveSceneRecord);
  const deleteScene = useAppStore((state) => state.deleteScene);
  const setStartScene = useAppStore((state) => state.setStartScene);
  const updateSceneConnection = useAppStore((state) => state.updateSceneConnection);
  const storyRecords = useAppStore(selectSceneRecordMapForStory(storyId));

  const story = storiesMetadata.find((metadata) => metadata.id === storyId);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<SceneManagerViewMode>('list');
  const [showSceneSelector, setShowSceneSelector] = useState(false);
  const [showNewSceneForm, setShowNewSceneForm] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [sceneToDelete, setSceneToDelete] = useState<SceneRecord | null>(null);

  const scenes = useMemo(() => {
    const allScenes = Object.values(storyRecords);
    if (!searchQuery.trim()) return allScenes;
    const query = searchQuery.toLowerCase();
    return allScenes.filter((scene) => {
      const description = scene.description ?? '';
      const tags = scene.tags ?? [];
      return (
        scene.name.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [storyRecords, searchQuery]);

  const startSceneId = scenes.find((scene) => scene.isStart)?.id || story?.startSceneId;

  // The graph always visualizes the whole story, unaffected by the list search.
  const allScenes = useMemo(() => Object.values(storyRecords), [storyRecords]);
  const graphStartSceneId = useMemo(
    () => allScenes.find((scene) => scene.isStart)?.id ?? story?.startSceneId ?? null,
    [allScenes, story?.startSceneId],
  );

  const openSceneEditor = useCallback((sceneId: string) => {
    navigateWithViewTransition(() => router.push({
      pathname: '/document-editor',
      params: { storyId, sceneId },
    }));
  }, [router, storyId]);

  const handleCreateScene = useCallback(() => {
    const name = newSceneName.trim() || `Scene ${scenes.length + 1}`;
    const newId = generateId('scene');
    const record = createManagedSceneRecord(
      storyId,
      newId,
      name,
      100 + scenes.length * 30,
      100 + Math.floor(scenes.length / 3) * 200,
    );
    saveSceneRecord(record);
    setNewSceneName('');
    setShowNewSceneForm(false);
    openSceneEditor(newId);
  }, [newSceneName, scenes.length, storyId, saveSceneRecord, openSceneEditor]);

  const handleEditScene = useCallback((scene: SceneRecord) => {
    openSceneEditor(scene.id);
  }, [openSceneEditor]);

  const handleDuplicateScene = useCallback((scene: SceneRecord) => {
    const newId = generateId('scene');
    const record: SceneRecord = {
      ...scene,
      id: newId,
      name: t('editor.sceneManager.copyName', { name: scene.name }),
      timeline: JSON.parse(JSON.stringify(scene.timeline || [])),
      flowX: scene.flowX + 30,
      flowY: scene.flowY + 30,
      isStart: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveSceneRecord(record);
  }, [saveSceneRecord, t]);

  const handleDeleteScene = useCallback((scene: SceneRecord) => {
    setSceneToDelete(scene);
  }, []);

  const confirmDeleteScene = useCallback(() => {
    if (!sceneToDelete) return;
    deleteScene(storyId, sceneToDelete.id);
    setSceneToDelete(null);
  }, [deleteScene, sceneToDelete, storyId]);

  // Scenes reachable only through the scene being deleted would end up in
  // «Поза сюжетом» — warn about the orphaned tail before confirming.
  const deleteSceneMessage = useMemo(() => {
    const base = t('editor.confirmDeleteSceneMessage', { name: sceneToDelete?.name ?? '' });
    if (!sceneToDelete) return base;
    const orphaned = computeOrphanedByDeletion(Object.values(storyRecords), sceneToDelete.id);
    if (!orphaned.length) return base;
    return base + '\n\n' + t('editor.confirmDeleteSceneOrphanWarning', { count: String(orphaned.length) });
  }, [sceneToDelete, storyRecords, t]);

  const handleSetStart = useCallback((sceneId: string) => {
    setStartScene(storyId, sceneId);
  }, [storyId, setStartScene]);

  const handleSceneImport = useCallback((_blockTypes: BlockType[]) => {
    setShowSceneSelector(false);
    const newId = generateId('scene');
    const record = createManagedSceneRecord(
      storyId,
      newId,
      t('editor.sceneManager.newSceneName', { number: String(scenes.length + 1) }),
      100 + scenes.length * 30,
      100 + Math.floor(scenes.length / 3) * 200,
    );
    saveSceneRecord(record);
    openSceneEditor(newId);
  }, [scenes.length, storyId, saveSceneRecord, openSceneEditor, t]);

  const handleConnectScenes = useCallback((fromSceneId: string, output: string, toSceneId: string) => {
    updateSceneConnection(storyId, fromSceneId, {
      targetSceneId: toSceneId,
      outputPort: output,
      label: output,
    });
    setShowSceneSelector(false);
  }, [storyId, updateSceneConnection]);

  const openPlay = useCallback(() => {
    navigateWithViewTransition(() => router.push({ pathname: '/play', params: { storyId } }));
  }, [router, storyId]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.md,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('menu.back')}
        >
          <Text style={[styles.backText, { color: colors.primary }]}>{t('menu.back')}</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {t('editor.sceneManager.storyScenes', { title: story?.title || t('editor.untitledStory') })}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
            {t('editor.sceneManager.sceneCount', { count: scenes.length })}
            {startSceneId ? ` / ${t('editor.sceneManager.startScene', { name: storyRecords[startSceneId]?.name || startSceneId })}` : ''}
          </Text>
        </View>
      </View>

      <View style={[styles.actionBar, { borderBottomColor: colors.border }]}>
        {showNewSceneForm ? (
          <TextInput
            value={newSceneName}
            onChangeText={setNewSceneName}
            placeholder={t('editor.sceneManager.namePlaceholder')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('editor.sceneName')}
            onSubmitEditing={handleCreateScene}
            style={[
              styles.searchInput,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
            ]}
          />
        ) : (
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('editor.sceneManager.searchPlaceholder')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('editor.searchScenes')}
            style={[
              styles.searchInput,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
            ]}
          />
        )}

        {showNewSceneForm ? (
          <>
            <Button variant="primary" size="sm" onPress={handleCreateScene}>
              {t('common.create')}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => { setShowNewSceneForm(false); setNewSceneName(''); }}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="sm" onPress={() => setShowNewSceneForm(true)}>
              {t('editor.addNewScene')}
            </Button>
            <Button variant="secondary" size="sm" onPress={() => setShowSceneSelector(true)}>
              {t('editor.sceneSelector.title')}
            </Button>
          </>
        )}

        <View style={styles.viewToggle}>
          <Button
            variant={viewMode === 'list' ? 'primary' : 'ghost'}
            size="sm"
            onPress={() => setViewMode('list')}
          >
            {t('editor.sceneManager.viewList')}
          </Button>
          <Button
            variant={viewMode === 'graph' ? 'primary' : 'ghost'}
            size="sm"
            onPress={() => setViewMode('graph')}
          >
            {t('editor.sceneManager.viewGraph')}
          </Button>
        </View>
      </View>

      {viewMode === 'graph' ? (
        <SceneGraphView
          scenes={allScenes}
          startSceneId={graphStartSceneId}
          onSelectScene={openSceneEditor}
          emptyLabel={t('editor.sceneManager.graphEmpty')}
        />
      ) : (
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {scenes.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('editor.sceneManager.emptyTitle')}</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {t('editor.sceneManager.emptyText')}
            </Text>
            <Button variant="primary" size="base" onPress={() => setShowSceneSelector(true)}>
              {t('editor.sceneManager.browseTemplates')}
            </Button>
          </View>
        ) : (
          scenes.map((scene) => (
            <View
              key={scene.id}
              style={[
                styles.sceneCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: scene.isStart ? colors.success : colors.border,
                },
              ]}
            >
              <View style={styles.sceneHeader}>
                {scene.isStart && (
                  <Text style={[styles.startBadge, { color: colors.success, borderColor: colors.success }]}>
                    {t('editor.sceneManager.startBadge')}
                  </Text>
                )}
                <Text style={[styles.sceneTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {scene.name}
                </Text>
              </View>

              <Text style={[styles.sceneMeta, { color: colors.muted }]}>
                {t('editor.sceneManager.meta', { blocks: scene.timeline?.length || 0, date: dateFormatter.format(new Date(scene.updatedAt)) })}
              </Text>

              {scene.tags.length > 0 && (
                <View style={styles.tags}>
                  {scene.tags.map((tag) => (
                    <Text key={tag} style={[styles.tag, { backgroundColor: colors.background, color: colors.muted }]}>
                      {tag}
                    </Text>
                  ))}
                </View>
              )}

              {scene.connections && scene.connections.length > 0 && (
                <Text style={[styles.connections, { color: colors.muted }]} numberOfLines={2}>
                  {t('editor.sceneManager.connections', { count: scene.connections.length })}:{' '}
                  {scene.connections.map((connection) => `${connection.outputPort} ${t('editor.sceneManager.connectionTo')} ${connection.targetSceneId}`).join(', ')}
                </Text>
              )}

              <View style={styles.sceneActions}>
                <Button variant="primary" size="sm" onPress={() => handleEditScene(scene)}>
                  {t('common.edit')}
                </Button>
                <Button variant="secondary" size="sm" onPress={() => handleDuplicateScene(scene)}>
                  {t('common.copy')}
                </Button>
                {!scene.isStart && (
                  <Button variant="ghost" size="sm" onPress={() => handleSetStart(scene.id)}>
                    {t('editor.sceneManager.setStart')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onPress={() => handleDeleteScene(scene)}>
                  {t('common.delete')}
                </Button>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      )}

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Text style={[styles.bottomMeta, { color: colors.muted }]}>
          {t('editor.sceneManager.sceneCount', { count: scenes.length })}
        </Text>
        <View style={styles.bottomActions}>
          <Button variant="primary" size="sm" onPress={openPlay}>
            {t('reader.continueReading')}
          </Button>
        </View>
      </View>

      <SceneSelector
        visible={showSceneSelector}
        onClose={() => setShowSceneSelector(false)}
        onSelectScene={handleSceneImport}
        onConnectScenes={handleConnectScenes}
        storyScenes={Object.values(storyRecords).map((scene) => ({ id: scene.id, name: scene.name }))}
      />
      <ConfirmDialog
        visible={sceneToDelete !== null}
        title={t('editor.confirmDeleteSceneTitle')}
        message={deleteSceneMessage}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDeleteScene}
        onCancel={() => setSceneToDelete(null)}
        destructive
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  backText: {
    ...typeScale.label,
    fontWeight: '800',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
  },
  subtitle: {
    ...typeScale.caption,
    marginTop: 2,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typeScale.label,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyTitle: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
  },
  emptyText: {
    maxWidth: 360,
    textAlign: 'center',
    ...typeScale.label,
  },
  sceneCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sceneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  startBadge: {
    ...typeScale.micro,
    fontWeight: '800',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  sceneTitle: {
    flex: 1,
    minWidth: 0,
    ...typeScale.body,
    fontWeight: '800',
  },
  sceneMeta: {
    ...typeScale.caption,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    ...typeScale.micro,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  connections: {
    ...typeScale.caption,
  },
  sceneActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  bottomMeta: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
