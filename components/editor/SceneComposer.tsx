/**
 * components/editor/SceneComposer.tsx — Main 3-panel editor layout
 */

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useEditorStore,
  selectSelectedBlock,
  selectCanUndo,
  selectCanRedo,
} from '@/stores/use-editor-store';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useColors } from '@/hooks/use-colors';
import { selectCanonicalSceneRecord, useAppStore } from '@/stores/use-app-store';
import { Button } from '@/components/ui';
import { type BlockType, type TimelineStep } from '@/lib/engine/types';
import {
  applyEditorDraftToSceneRecord,
  createSceneRecordFromEditorDraft,
  type EditorSceneDraft,
} from '@/lib/editor-scene-draft';
import { BlockLibraryPanel } from './BlockLibraryPanel';
import { TimelinePanel } from './TimelinePanel';
import { PropertiesPanel } from './PropertiesPanel';
import { MiniPreview } from './MiniPreview';
import { SceneSelector } from './SceneSelector';

interface SceneComposerProps {
  storyId: string;
  sceneId: string;
  initialSceneDraft: EditorSceneDraft;
}

export function SceneComposer({ storyId, sceneId, initialSceneDraft }: SceneComposerProps) {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const isPhone = layout.deviceType === 'phone';

  const {
    sceneName, timeline, isDirty, selectedBlockId,
    addBlock, removeBlock, updateBlock, moveBlock, duplicateBlock, toggleBlockCollapsed,
    undo, redo, selectBlock, setSceneName, hydrateSceneDraft,
  } = useEditorStore();

  const selectedBlock = useEditorStore(selectSelectedBlock);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);

  const [showBlockLibrary, setShowBlockLibrary] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [showMiniPreview, setShowMiniPreview] = useState(true);
  const [showSceneSelector, setShowSceneSelector] = useState(false);

  // Get scenes from app store for connection mode
  const storyScenes = Object.values(sceneRecordsByStory[storyId] || {}).map((record) => ({
    id: record.id,
    name: record.name || 'Untitled',
  }));

  React.useEffect(() => {
    hydrateSceneDraft(initialSceneDraft);
  }, [hydrateSceneDraft, initialSceneDraft]);

  const handleBlockSelect = useCallback((stepId: string | null) => {
    selectBlock(stepId);
    if (isPhone && stepId) {
      setShowProperties(true);
      setShowBlockLibrary(false);
    }
  }, [selectBlock, isPhone]);

  const handleAddBlock = useCallback((blockType: BlockType) => {
    addBlock(blockType);
    if (isPhone) setShowBlockLibrary(false);
  }, [addBlock, isPhone]);

  const handleSave = useCallback(() => {
    const draft = {
      sceneId,
      sceneName,
      timeline,
    };
    const existingRecord = useAppStore(s => selectCanonicalSceneRecord(storyId, sceneId)(s));
    const record = existingRecord
      ? applyEditorDraftToSceneRecord(existingRecord, draft)
      : createSceneRecordFromEditorDraft(storyId, draft);

    useAppStore.getState().saveSceneRecord(record);
    useEditorStore.setState({ isDirty: false });
  }, [storyId, sceneId, sceneName, timeline]);

  const handlePreview = useCallback(() => {
    router.push({ pathname: '/preview', params: { storyId, sceneId } });
  }, [storyId, sceneId, router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleSceneSelectorOpen = useCallback(() => {
    setShowSceneSelector(true);
  }, []);

  const handleSceneSelectorClose = useCallback(() => {
    setShowSceneSelector(false);
  }, []);

  const handleSceneImport = useCallback((blockTypes: BlockType[]) => {
    // Add template blocks to timeline
    blockTypes.forEach((bt) => addBlock(bt));
  }, [addBlock]);

  const handleConnectScenes = useCallback((fromSceneId: string, output: string, toSceneId: string, input: string) => {
    useAppStore.getState().updateSceneConnection(storyId, fromSceneId, {
      targetSceneId: toSceneId,
      outputPort: output,
      label: input === 'start' ? '' : input,
    });
  }, [storyId]);

  // Phone layout
  if (isPhone) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 12, paddingTop: insets.top + 8, paddingBottom: 8,
          borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
        }}>
          <Pressable onPress={handleBack} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>←</Text>
          </Pressable>
          <TextInput
            value={sceneName} onChangeText={setSceneName}
            style={{ flex: 1, color: colors.foreground, fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 }}
            placeholder="Scene name" placeholderTextColor={colors.muted}
          />
          <Pressable onPress={handleSave} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{isDirty ? '💾*' : '💾'}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
          <Pressable onPress={() => { setShowBlockLibrary(true); setShowProperties(false); }} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: showBlockLibrary ? colors.primary : colors.muted, fontSize: 12, fontWeight: '600' }}>🧱 Blocks</Text>
          </Pressable>
          <Pressable onPress={() => { setShowBlockLibrary(false); setShowProperties(false); }} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: !showBlockLibrary && !showProperties ? colors.primary : colors.muted, fontSize: 12, fontWeight: '600' }}>📝 Timeline</Text>
          </Pressable>
          <Pressable onPress={handlePreview} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>▶ Preview</Text>
          </Pressable>
          <Pressable onPress={handleSceneSelectorOpen} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>📚 Scenes</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flex: 1 }}>
          {showBlockLibrary && (
            <BlockLibraryPanel onBlockTap={handleAddBlock} />
          )}
          {(!showBlockLibrary || isPhone) && (
            <View style={{ flex: 1 }}>
              <TimelinePanel timeline={timeline} selectedBlockId={selectedBlockId} onBlockSelect={handleBlockSelect} onBlockAdd={handleAddBlock} onBlockRemove={removeBlock} onBlockMove={moveBlock} onBlockDuplicate={duplicateBlock} onBlockToggleCollapse={toggleBlockCollapsed} />
            </View>
          )}
          {selectedBlock && (
            <View style={{ width: 300, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface }}>
              <ScrollView style={{ flex: 1 }}>
                <PropertiesPanel block={selectedBlock} onUpdate={(u: Partial<TimelineStep>) => updateBlock(selectedBlock.id, u)} onDelete={() => removeBlock(selectedBlock.id)} onDuplicate={() => duplicateBlock(selectedBlock.id)} onClose={() => handleBlockSelect(null)} />
              </ScrollView>
            </View>
          )}
        </View>

      <SceneSelector
        visible={showSceneSelector}
        onClose={handleSceneSelectorClose}
        onSelectScene={handleSceneImport}
        onConnectScenes={handleConnectScenes}
        storyScenes={storyScenes}
      />
    </View>
  );
}

  // Desktop layout
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
        borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
      }}>
        <Pressable onPress={handleBack} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>← Back</Text>
        </Pressable>
        <TextInput
          value={sceneName} onChangeText={setSceneName}
          style={{ flex: 1, color: colors.foreground, fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 }}
          placeholder="Scene name" placeholderTextColor={colors.muted}
        />
        <Pressable onPress={handleSave} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{isDirty ? '💾*' : '💾'}</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', flex: 1, overflow: 'hidden' }}>
        <BlockLibraryPanel onBlockTap={handleAddBlock} />
        <View style={{ flex: 1 }}>
          <TimelinePanel timeline={timeline} selectedBlockId={selectedBlockId} onBlockSelect={handleBlockSelect} onBlockAdd={handleAddBlock} onBlockRemove={removeBlock} onBlockMove={moveBlock} onBlockDuplicate={duplicateBlock} onBlockToggleCollapse={toggleBlockCollapsed} />
        </View>
        {selectedBlock && (
          <View style={{ width: 300, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface }}>
            <ScrollView style={{ flex: 1 }}>
              <PropertiesPanel block={selectedBlock} onUpdate={(u: Partial<TimelineStep>) => updateBlock(selectedBlock.id, u)} onDelete={() => removeBlock(selectedBlock.id)} onDuplicate={() => duplicateBlock(selectedBlock.id)} onClose={() => handleBlockSelect(null)} />
            </ScrollView>
          </View>
        )}
      </View>

      <SceneSelector
        visible={showSceneSelector}
        onClose={handleSceneSelectorClose}
        onSelectScene={handleSceneImport}
        onConnectScenes={handleConnectScenes}
        storyScenes={storyScenes}
      />
    </View>
  );
}
