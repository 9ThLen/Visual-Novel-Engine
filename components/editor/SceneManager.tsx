import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { createSceneRecordFromEditorDraft } from '@/lib/editor-scene-draft';
import type { BlockType, SceneRecord } from '@/lib/engine/types';
import { generateId } from '@/lib/id-utils';
import { navigateWithViewTransition } from '@/lib/navigation-transition';
import { useAppStore } from '@/stores/use-app-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { SceneSelector } from './SceneSelector';

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
  const deleteSceneRecord = useAppStore((state) => state.deleteSceneRecord);
  const setStartScene = useAppStore((state) => state.setStartScene);
  const sceneRecordsByStory = useAppStore((state) => state.sceneRecordsByStory);

  const story = storiesMetadata.find((metadata) => metadata.id === storyId);
  const storyRecords = useMemo(
    () => sceneRecordsByStory[storyId] || {},
    [sceneRecordsByStory, storyId],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [showSceneSelector, setShowSceneSelector] = useState(false);
  const [showNewSceneForm, setShowNewSceneForm] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');

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

  const openSceneEditor = useCallback((sceneId: string) => {
    navigateWithViewTransition(() => router.push({
      pathname: '/document-editor',
      params: { storyId, sceneId },
    } as never));
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
    useEditorStore.getState().setScene(scene.id, scene.name, scene.timeline || []);
    openSceneEditor(scene.id);
  }, [openSceneEditor]);

  const handleDuplicateScene = useCallback((scene: SceneRecord) => {
    const newId = generateId('scene');
    const record: SceneRecord = {
      ...scene,
      id: newId,
      name: `${scene.name} (copy)`,
      timeline: JSON.parse(JSON.stringify(scene.timeline || [])),
      flowX: scene.flowX + 30,
      flowY: scene.flowY + 30,
      isStart: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveSceneRecord(record);
  }, [saveSceneRecord]);

  const handleDeleteScene = useCallback((scene: SceneRecord) => {
    Alert.alert(
      'Delete Scene',
      `Delete "${scene.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSceneRecord(storyId, scene.id),
        },
      ],
    );
  }, [deleteSceneRecord, storyId]);

  const handleSetStart = useCallback((sceneId: string) => {
    setStartScene(storyId, sceneId);
  }, [storyId, setStartScene]);

  const handleSceneImport = useCallback((_blockTypes: BlockType[]) => {
    setShowSceneSelector(false);
    const newId = generateId('scene');
    const record = createManagedSceneRecord(
      storyId,
      newId,
      `New Scene ${scenes.length + 1}`,
      100 + scenes.length * 30,
      100 + Math.floor(scenes.length / 3) * 200,
    );
    saveSceneRecord(record);
    useEditorStore.getState().setScene(record.id, record.name, record.timeline);
    openSceneEditor(newId);
  }, [scenes.length, storyId, saveSceneRecord, openSceneEditor]);

  const openPlay = useCallback(() => {
    navigateWithViewTransition(() => router.push({ pathname: '/play', params: { storyId } } as never));
  }, [router, storyId]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
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
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {story?.title || 'Story'} Scenes
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
            {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
            {startSceneId ? ` · Start: ${storyRecords[startSceneId]?.name || startSceneId}` : ''}
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
            accessibilityLabel="Scene Name"
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
            accessibilityLabel="Search Scenes"
            style={[
              styles.searchInput,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
            ]}
          />
        )}

        {showNewSceneForm ? (
          <>
            <Button variant="primary" size="sm" onPress={handleCreateScene}>
              Create
            </Button>
            <Button variant="ghost" size="sm" onPress={() => { setShowNewSceneForm(false); setNewSceneName(''); }}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="sm" onPress={() => setShowNewSceneForm(true)}>
              New Scene
            </Button>
            <Button variant="secondary" size="sm" onPress={() => setShowSceneSelector(true)}>
              Templates
            </Button>
          </>
        )}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {scenes.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Scenes Yet</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Create a scene manually or start from a template.
            </Text>
            <Button variant="primary" size="base" onPress={() => setShowSceneSelector(true)}>
              Browse Templates
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
                    START
                  </Text>
                )}
                <Text style={[styles.sceneTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {scene.name}
                </Text>
              </View>

              <Text style={[styles.sceneMeta, { color: colors.muted }]}>
                {scene.timeline?.length || 0} blocks · Updated {dateFormatter.format(new Date(scene.updatedAt))}
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
                  {scene.connections.length} connection{scene.connections.length !== 1 ? 's' : ''}:{' '}
                  {scene.connections.map((connection) => `${connection.outputPort} to ${connection.targetSceneId}`).join(', ')}
                </Text>
              )}

              <View style={styles.sceneActions}>
                <Button variant="primary" size="sm" onPress={() => handleEditScene(scene)}>
                  Edit
                </Button>
                <Button variant="secondary" size="sm" onPress={() => handleDuplicateScene(scene)}>
                  Copy
                </Button>
                {!scene.isStart && (
                  <Button variant="ghost" size="sm" onPress={() => handleSetStart(scene.id)}>
                    Set Start
                  </Button>
                )}
                <Button variant="ghost" size="sm" onPress={() => handleDeleteScene(scene)}>
                  Delete
                </Button>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Text style={[styles.bottomMeta, { color: colors.muted }]}>
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
        </Text>
        <View style={styles.bottomActions}>
          <Button variant="primary" size="sm" onPress={openPlay}>
            Play
          </Button>
        </View>
      </View>

      <SceneSelector
        visible={showSceneSelector}
        onClose={() => setShowSceneSelector(false)}
        onSelectScene={handleSceneImport}
        onConnectScenes={() => {}}
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
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: '800',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 28,
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
    maxWidth: 360,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  sceneCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  sceneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  sceneTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '800',
  },
  sceneMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  connections: {
    fontSize: 12,
    lineHeight: 18,
  },
  sceneActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  bottomMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
