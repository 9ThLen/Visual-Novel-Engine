import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
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
import { useI18n } from '@/hooks/use-i18n';
import { showToast } from '@/lib/toast-store';
import { spacing, typeScale } from '@/lib/design-tokens';
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
  const { t } = useI18n();
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
      showToast(t('manuscript.saveSuccess'), 'success');
    } finally {
      setIsSaving(false);
    }
  }, [draft, saveSceneRecord, sceneRecords, t]);

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
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...typeScale.caption, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' }}>
              {t('manuscript.title')}
            </Text>
            <Text style={{ ...typeScale.pageTitle, fontWeight: '700', color: colors.foreground, marginTop: spacing.sm }}>
              {storyMetadata.title}
            </Text>
            <Text style={{ ...typeScale.label, color: colors.muted, marginTop: spacing.sm }}>
              {t('manuscript.subtitle')}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onPress={() => router.back()}>
              {t('menu.back')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => router.push({ pathname: '/scene-manager', params: { storyId } })}
            >
              {t('editor.scenes')}
            </Button>
            <Button variant="secondary" size="sm" onPress={handleDiscard} disabled={!isDirty || isSaving}>
              {t('common.discard')}
            </Button>
            <Button variant="primary" size="sm" onPress={handleSave} disabled={!isDirty} loading={isSaving}>
              {t('manuscript.save')}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
              {draft.scenes.map((scene) => {
                const isActive = scene.sceneId === activeSceneId;
                return (
                  <Button
                    key={scene.sceneId}
                    variant={isActive ? 'primary' : 'secondary'}
                    size="sm"
                    onPress={() => handleSelectScene(scene.sceneId)}
                  >
                    {scene.sceneName || t('editor.untitledScene')}
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
            paddingHorizontal: layout.isTablet ? spacing.xl : spacing.lg,
            paddingVertical: spacing.xl,
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
