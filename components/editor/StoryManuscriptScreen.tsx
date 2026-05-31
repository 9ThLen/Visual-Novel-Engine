import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import {
  applyStoryManuscriptChanges,
  buildStoryManuscript,
  createEmptyStoryManuscriptBlock,
  moveStoryManuscriptSceneBlock,
  type StoryManuscriptBlock,
} from '@/lib/editor/story-manuscript';
import type { StoryManuscriptScene } from '@/lib/editor/story-manuscript-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAppStore } from '@/stores/use-app-store';
import { StoryManuscriptSidebar } from './manuscript/StoryManuscriptSidebar';
import { StoryManuscriptSection } from './manuscript/StoryManuscriptSection';

interface StoryManuscriptScreenProps {
  storyId: string;
  storyMetadata: StoryMetadata;
  sceneRecords: SceneRecord[];
}

export function StoryManuscriptScreen({
  storyId,
  storyMetadata,
  sceneRecords,
}: StoryManuscriptScreenProps) {
  const router = useRouter();
  const colors = useColors();
  const layout = useResponsiveLayout();
  const saveSceneRecord = useAppStore((state) => state.saveSceneRecord);
  const scrollViewRef = useRef<ScrollView>(null);
  const sceneOffsetsRef = useRef<Record<string, number>>({});

  // Purge offset entries for removed scenes
  useEffect(() => {
    const currentSceneIds = new Set(sceneRecords.map((s) => s.id));
    Object.keys(sceneOffsetsRef.current).forEach((key) => {
      if (!currentSceneIds.has(key)) {
        delete sceneOffsetsRef.current[key];
      }
    });
  }, [sceneRecords]);

  const baseManuscript = useMemo(
    () => buildStoryManuscript(storyMetadata, sceneRecords),
    [sceneRecords, storyMetadata]
  );
  const baseSnapshot = useMemo(() => JSON.stringify(baseManuscript), [baseManuscript]);

  const [draft, setDraft] = useState(baseManuscript);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(baseManuscript.scenes[0]?.sceneId ?? null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(baseManuscript);
    setActiveSceneId(baseManuscript.scenes[0]?.sceneId ?? null);
  }, [baseManuscript]);

  const isDirty = useMemo(() => JSON.stringify(draft) !== baseSnapshot, [baseSnapshot, draft]);
  const useSidebarLayout = layout.screenWidth >= 960;

  const updateScene = useCallback((sceneId: string, updater: (currentScene: StoryManuscriptScene) => StoryManuscriptScene) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      scenes: currentDraft.scenes.map((scene) => (scene.sceneId === sceneId ? updater(scene) : scene)),
    }));
  }, []);

  const handleSceneNameChange = useCallback((sceneId: string, sceneName: string) => {
    updateScene(sceneId, (scene) => ({ ...scene, sceneName }));
  }, [updateScene]);

  const handleBlockChange = useCallback((sceneId: string, blockId: string, nextBlock: StoryManuscriptBlock) => {
    updateScene(sceneId, (scene) => ({
      ...scene,
      blocks: scene.blocks.map((block) => (block.id === blockId ? nextBlock : block)),
    }));
  }, [updateScene]);

  const handleMoveBlock = useCallback((sceneId: string, fromIndex: number, toIndex: number) => {
    setDraft((currentDraft) => moveStoryManuscriptSceneBlock(currentDraft, sceneId, fromIndex, toIndex));
  }, []);

  const handleRemoveBlock = useCallback((sceneId: string, blockId: string) => {
    updateScene(sceneId, (scene) => ({
      ...scene,
      blocks: scene.blocks.filter((block) => block.id !== blockId),
    }));
  }, [updateScene]);

  const handleAddBlock = useCallback((sceneId: string, kind: 'narration' | 'dialogue' | 'choice_group') => {
    updateScene(sceneId, (scene) => ({
      ...scene,
      blocks: [...scene.blocks, createEmptyStoryManuscriptBlock(kind)],
    }));
  }, [updateScene]);

  const handleSelectScene = useCallback((sceneId: string) => {
    setActiveSceneId(sceneId);
    scrollViewRef.current?.scrollTo({
      y: sceneOffsetsRef.current[sceneId] ?? 0,
      animated: true,
    });
  }, []);

  const handleMeasureScene = useCallback((sceneId: string, y: number) => {
    sceneOffsetsRef.current[sceneId] = y;
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const updatedScenes = applyStoryManuscriptChanges(draft, sceneRecords);
      updatedScenes.forEach((scene) => saveSceneRecord(scene));
      Alert.alert('Saved', 'Manuscript changes were saved to the story.');
    } finally {
      setIsSaving(false);
    }
  }, [draft, saveSceneRecord, sceneRecords]);

  const handleDiscard = useCallback(() => {
    setDraft(baseManuscript);
  }, [baseManuscript]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 20,
          paddingVertical: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' }}>
              Story Manuscript
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.foreground, marginTop: 8 }}>
              {storyMetadata.title}
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6 }}>
              Цілісний літературний вигляд усіх сцен з inline editing та scene-local reorder.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onPress={() => router.back()}>
              Back
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => router.push({ pathname: '/scene-manager', params: { storyId } } as never)}
            >
              Scenes
            </Button>
            <Button variant="secondary" size="sm" onPress={handleDiscard} disabled={!isDirty || isSaving}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onPress={handleSave} disabled={!isDirty} loading={isSaving}>
              Save Manuscript
            </Button>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: useSidebarLayout ? 'row' : 'column' }}>
        {useSidebarLayout ? (
          <StoryManuscriptSidebar
            scenes={draft.scenes}
            activeSceneId={activeSceneId}
            onSelectScene={handleSelectScene}
          />
        ) : (
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
              {draft.scenes.map((scene) => {
                const isActive = scene.sceneId === activeSceneId;
                return (
                  <Button
                    key={scene.sceneId}
                    variant={isActive ? 'primary' : 'secondary'}
                    size="sm"
                    onPress={() => handleSelectScene(scene.sceneId)}
                  >
                    {scene.sceneName || 'Untitled Scene'}
                  </Button>
                );
              })}
            </ScrollView>
          </View>
        )}

        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: layout.isTablet ? 28 : 16,
            paddingVertical: 24,
            alignSelf: 'center',
            width: '100%',
            maxWidth: 980,
          }}
        >
          {draft.scenes.map((scene, index) => (
            <StoryManuscriptSection
              key={scene.sceneId}
              scene={scene}
              index={index}
              onSceneNameChange={handleSceneNameChange}
              onBlockChange={handleBlockChange}
              onMoveBlock={handleMoveBlock}
              onRemoveBlock={handleRemoveBlock}
              onAddBlock={handleAddBlock}
              onMeasure={handleMeasureScene}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
