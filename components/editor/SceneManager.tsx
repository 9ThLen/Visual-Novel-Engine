/**
 * components/editor/SceneManager.tsx — Scene list manager for a story
 *
 * Shows all saved scenes for a story with:
 * - Search and filter
 * - CRUD operations (edit, duplicate, delete)
 * - Mark as start scene
 * - Navigate to scene editor or story flow
 * - Create new scene from templates
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/stores/use-app-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { Button } from '@/components/ui';
import { generateId } from '@/lib/id-utils';
import { createSceneRecordFromEditorDraft } from '@/lib/editor-scene-draft';
import { SceneSelector } from './SceneSelector';
import type { SceneRecord } from '@/lib/engine/types';

interface SceneManagerProps {
  storyId: string;
}

function createManagedSceneRecord(
  storyId: string,
  sceneId: string,
  sceneName: string,
  flowX: number,
  flowY: number
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

  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const getScenesForStory = useAppStore((s) => s.getScenesForStory);
  const saveSceneRecord = useAppStore((s) => s.saveSceneRecord);
  const deleteSceneRecord = useAppStore((s) => s.deleteSceneRecord);
  const setStartScene = useAppStore((s) => s.setStartScene);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);

  const story = storiesMetadata.find((m) => m.id === storyId);
  const storyRecords = sceneRecordsByStory[storyId] || {};

  const [searchQuery, setSearchQuery] = useState('');
  const [showSceneSelector, setShowSceneSelector] = useState(false);
  const [showNewSceneForm, setShowNewSceneForm] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');

  const scenes = useMemo(() => {
    const all = Object.values(storyRecords);
    if (!searchQuery.trim()) return all;
    const q = searchQuery.toLowerCase();
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [storyRecords, searchQuery]);

  const startSceneId = scenes.find((s) => s.isStart)?.id || story?.startSceneId;

  const handleCreateScene = useCallback(() => {
    const name = newSceneName.trim() || `Scene ${scenes.length + 1}`;
    const newId = generateId('scene');
    const record = createManagedSceneRecord(
      storyId,
      newId,
      name,
      100 + scenes.length * 30,
      100 + Math.floor(scenes.length / 3) * 200
    );
    saveSceneRecord(record);

    // Navigate to scene editor
    router.push({
      pathname: '/scene-editor',
      params: { storyId, sceneId: newId },
    });
  }, [newSceneName, scenes.length, storyId, saveSceneRecord, router]);

  const handleEditScene = useCallback((scene: SceneRecord) => {
    // Reset editor store and navigate
    useEditorStore.getState().setScene(scene.id, scene.name, scene.timeline || []);
    router.push({
      pathname: '/scene-editor',
      params: { storyId, sceneId: scene.id },
    } as never);
  }, [storyId, router]);

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
      `Are you sure you want to delete "${scene.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSceneRecord(storyId, scene.id);
          },
        },
      ]
    );
  }, [deleteSceneRecord, storyId]);

  const handleSetStart = useCallback((sceneId: string) => {
    setStartScene(storyId, sceneId);
  }, [storyId, setStartScene]);

  const handleSceneImport = useCallback((blockTypes: any[]) => {
    setShowSceneSelector(false);
    const newId = generateId('scene');
    const record = createManagedSceneRecord(
      storyId,
      newId,
      `New Scene ${scenes.length + 1}`,
      100 + scenes.length * 30,
      100 + Math.floor(scenes.length / 3) * 200
    );
    saveSceneRecord(record);
    useEditorStore.getState().setScene(record.id, record.name, record.timeline);
    router.push({
      pathname: '/scene-editor',
      params: { storyId, sceneId: newId },
    });
  }, [scenes.length, storyId, saveSceneRecord, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: insets.top + 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <Pressable onPress={() => router.back()} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
          <Text style={{ color: colors.primary, fontSize: 18 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }} numberOfLines={1}>
            {story?.title || 'Story'} — Scenes
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
            {startSceneId ? ` · Start: ${storyRecords[startSceneId]?.name || startSceneId}` : ''}
          </Text>
        </View>
      </View>

      {/* Action bar */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        {showNewSceneForm ? (
          <TextInput
            value={newSceneName}
            onChangeText={setNewSceneName}
            placeholder="Scene name..."
            placeholderTextColor={colors.muted}
            autoFocus
            onSubmitEditing={handleCreateScene}
            style={{
              flex: 1,
              backgroundColor: colors.background,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              color: colors.foreground,
              fontSize: 14,
            }}
          />
        ) : (
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search scenes..."
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              backgroundColor: colors.background,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              color: colors.foreground,
              fontSize: 14,
            }}
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
              + New
            </Button>
            <Button variant="secondary" size="sm" onPress={() => setShowSceneSelector(true)}>
              📂 Templates
            </Button>
          </>
        )}
      </View>

      {/* Scene list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {scenes.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 16 }}>
              No scenes yet. Create your first scene!
            </Text>
            <Button variant="primary" size="base" onPress={() => setShowSceneSelector(true)}>
              📂 Browse Templates
            </Button>
          </View>
        ) : (
          scenes.map((scene) => (
            <View
              key={scene.id}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: scene.isStart ? colors.success : colors.border,
              }}
            >
              {/* Scene header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                {scene.isStart && (
                  <Text style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: colors.success,
                    marginRight: 8,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: colors.success,
                  }}>
                    START
                  </Text>
                )}
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.foreground }}>
                  {scene.name}
                </Text>
              </View>

              {/* Meta */}
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
                {scene.timeline?.length || 0} blocks · Updated {new Date(scene.updatedAt).toLocaleDateString()}
              </Text>

              {/* Tags */}
              {scene.tags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {scene.tags.map((tag) => (
                    <Text key={tag} style={{
                      fontSize: 10,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: colors.background,
                      color: colors.muted,
                    }}>
                      {tag}
                    </Text>
                  ))}
                </View>
              )}

              {/* Connections */}
              {scene.connections && scene.connections.length > 0 && (
                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>
                  → {scene.connections.length} connection{scene.connections.length !== 1 ? 's' : ''}:{' '}
                  {scene.connections.map((c) => `${c.outputPort} → ${c.targetSceneId}`).join(', ')}
                </Text>
              )}

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => handleEditScene(scene)}
                >
                  ✏️ Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => handleDuplicateScene(scene)}
                >
                  📋 Copy
                </Button>
                {!scene.isStart && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => handleSetStart(scene.id)}
                  >
                    ▶ Set Start
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => handleDeleteScene(scene)}
                >
                  🗑
                </Button>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
        </Text>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => router.push({ pathname: '/story-flow', params: { storyId } } as never)}
        >
          🗺 Flow
        </Button>
        <Button
          variant="primary"
          size="sm"
          onPress={() => router.push({ pathname: '/play', params: { storyId } } as never)}
        >
          ▶ Play
        </Button>
      </View>

      {/* Scene Selector modal */}
      <SceneSelector
        visible={showSceneSelector}
        onClose={() => setShowSceneSelector(false)}
        onSelectScene={handleSceneImport}
        onConnectScenes={() => {}}
      />
    </View>
  );
}
