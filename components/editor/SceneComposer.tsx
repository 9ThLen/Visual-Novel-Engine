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
import { useAppStore } from '@/stores/use-app-store';
import { Button } from '@/components/ui';
import { type BlockType, type TimelineStep } from '@/lib/engine/types';
import {
  type EditorSceneDraft,
} from '@/lib/editor-scene-draft';
import { resolveSceneRecordForSave } from '@/lib/editor-scene-save';
import { BlockLibraryPanel } from './BlockLibraryPanel';
import { TimelinePanel } from './TimelinePanel';
import { PropertiesPanel } from './PropertiesPanel';
import { MiniPreview } from './MiniPreview';
import { SceneSelector } from './SceneSelector';
import { getPhoneComposerPanel } from '@/lib/mobile-composer-layout';
import { useEditorShortcuts, useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/use-keyboard-shortcuts';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useI18n } from '@/lib/i18n';

interface SceneComposerProps {
  storyId: string;
  sceneId: string;
  initialSceneDraft: EditorSceneDraft;
}

export function SceneComposer({ storyId, sceneId, initialSceneDraft }: SceneComposerProps) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const isPhone = layout.deviceType === 'phone';

  const {
    sceneName, timeline, isDirty, isSaving, selectedBlockId,
    addBlock, removeBlock, updateBlock, moveBlock, duplicateBlock, toggleBlockCollapsed,
    undo, redo, selectBlock, setSceneName, hydrateSceneDraft, setIsSaving,
  } = useEditorStore();

  const selectedBlock = useEditorStore(selectSelectedBlock);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);

  const [showBlockLibrary, setShowBlockLibrary] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [showMiniPreview, setShowMiniPreview] = useState(true);
  const [showSceneSelector, setShowSceneSelector] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const phonePanel = getPhoneComposerPanel({
    showBlockLibrary,
    showProperties,
    hasSelectedBlock: Boolean(selectedBlock),
  });

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
    if (isPhone) {
      if (stepId) {
        setShowProperties(true);
        setShowBlockLibrary(false);
      } else {
        setShowProperties(false);
      }
    }
  }, [selectBlock, isPhone]);

  const handleAddBlock = useCallback((blockType: BlockType) => {
    addBlock(blockType);
    if (isPhone) {
      setShowBlockLibrary(false);
      setShowProperties(false);
    }
  }, [addBlock, isPhone]);

  const handleSave = useCallback(() => {
    setIsSaving(true);
    const draft = {
      sceneId,
      sceneName,
      timeline,
    };
    const appState = useAppStore.getState();
    const record = resolveSceneRecordForSave(appState, storyId, sceneId, draft);

    appState.saveSceneRecord(record);
    useEditorStore.setState({ isDirty: false });
    setTimeout(() => setIsSaving(false), 500);
  }, [storyId, sceneId, sceneName, timeline, setIsSaving]);

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

  const handleDeleteConfirm = useCallback(() => {
    if (pendingDeleteId) removeBlock(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, removeBlock]);

  useEditorShortcuts({
    onUndo: undo,
    onRedo: redo,
    onDuplicate: selectedBlockId ? () => duplicateBlock(selectedBlockId) : undefined,
    onDelete: selectedBlockId ? () => setPendingDeleteId(selectedBlockId) : undefined,
  });

  useKeyboardShortcuts({
    shortcuts: {
      redo_shiftz: { key: 'z', ctrl: true, shift: true, handler: redo },
      save: { ...COMMON_SHORTCUTS.save, handler: handleSave },
      preview: { ...COMMON_SHORTCUTS.preview, handler: handlePreview },
      escape: { ...COMMON_SHORTCUTS.escape, handler: () => selectBlock(null) },
      delete_backspace: { key: 'backspace', handler: () => selectedBlockId && setPendingDeleteId(selectedBlockId) },
      focus_search: {
        key: 'a', ctrl: true,
        handler: () => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus(),
      },
    },
  });

  // Phone layout
  if (isPhone) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 12, paddingTop: insets.top + 8, paddingBottom: 8,
          borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
        }}>
          <Pressable onPress={handleBack} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>Back</Text>
          </Pressable>
          <TextInput
            value={sceneName} onChangeText={setSceneName}
            style={{ flex: 1, color: colors.foreground, fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 }}
            placeholder={t('editor.sceneName')} placeholderTextColor={colors.muted}
            accessibilityLabel={t('editor.sceneName')}
          />
          <Pressable onPress={handleSave} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={t('editor.save')}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{isSaving ? 'Saving…' : isDirty ? 'Save*' : 'Saved'}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
          <Pressable
            onPress={() => { setShowBlockLibrary(true); setShowProperties(false); }}
            style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={t('editor.blocks')}
          >
            <Text style={{ color: showBlockLibrary ? colors.primary : colors.muted, fontSize: 12, fontWeight: '600' }}>{t('editor.blocks')}</Text>
          </Pressable>
          <Pressable
            onPress={() => { setShowBlockLibrary(false); setShowProperties(false); }}
            style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={t('editor.timeline')}
          >
            <Text style={{ color: !showBlockLibrary && !showProperties ? colors.primary : colors.muted, fontSize: 12, fontWeight: '600' }}>{t('editor.timeline')}</Text>
          </Pressable>
          <Pressable onPress={handlePreview} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={t('editor.preview')}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{t('editor.preview')}</Text>
          </Pressable>
          <Pressable onPress={handleSceneSelectorOpen} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={t('editor.scenes')}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{t('editor.scenes')}</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          {phonePanel === 'blocks' && (
            <BlockLibraryPanel onBlockTap={handleAddBlock} />
          )}
          {phonePanel === 'timeline' && (
            <View style={{ flex: 1 }}>
              <TimelinePanel timeline={timeline} selectedBlockId={selectedBlockId} onBlockSelect={handleBlockSelect} onBlockAdd={handleAddBlock} onBlockRemove={(id: string) => setPendingDeleteId(id)} onBlockMove={moveBlock} onBlockDuplicate={duplicateBlock} onBlockToggleCollapse={toggleBlockCollapsed} />
            </View>
          )}
          {phonePanel === 'properties' && selectedBlock && (
            <View style={{ flex: 1, borderLeftWidth: 0, borderLeftColor: colors.border, backgroundColor: colors.surface }}>
              <ScrollView style={{ flex: 1 }}>
                <PropertiesPanel block={selectedBlock} onUpdate={(u: Partial<TimelineStep>) => updateBlock(selectedBlock.id, u)} onDelete={() => setPendingDeleteId(selectedBlock.id)} onDuplicate={() => duplicateBlock(selectedBlock.id)} onClose={() => handleBlockSelect(null)} />
              </ScrollView>
            </View>
          )}
        </View>

      {/* Undo/Redo bar for phone */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, gap: 24, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Pressable onPress={undo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3, padding: 8 }} accessibilityRole="button" accessibilityLabel={t('editor.undo')}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>{t('editor.undo')}</Text>
        </Pressable>
        <Pressable onPress={redo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.3, padding: 8 }} accessibilityRole="button" accessibilityLabel={t('editor.redo')}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>{t('editor.redo')}</Text>
        </Pressable>
      </View>

      <SceneSelector
        visible={showSceneSelector}
        onClose={handleSceneSelectorClose}
        onSelectScene={handleSceneImport}
        onConnectScenes={handleConnectScenes}
        storyScenes={storyScenes}
      />
      <ConfirmDialog
        visible={pendingDeleteId !== null}
        title={t('editor.confirmDeleteBlockTitle')}
        message={t('editor.confirmDeleteBlockMessage')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDeleteId(null)}
        destructive
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
        <Pressable onPress={handleBack} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>{t('menu.back')}</Text>
        </Pressable>
        <TextInput
          value={sceneName} onChangeText={setSceneName}
          style={{ flex: 1, color: colors.foreground, fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 }}
          placeholder={t('editor.sceneName')} placeholderTextColor={colors.muted}
          accessibilityLabel={t('editor.sceneName')}
        />
        <Pressable onPress={handleSave} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={t('editor.save')}>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{isSaving ? 'Saving…' : isDirty ? 'Save*' : 'Saved'}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8, marginRight: 12 }}>
          <Pressable onPress={undo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }} accessibilityRole="button" accessibilityLabel={t('editor.undo')}>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>{t('editor.undo')}</Text>
          </Pressable>
          <Pressable onPress={redo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }} accessibilityRole="button" accessibilityLabel={t('editor.redo')}>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>{t('editor.redo')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flex: 1, overflow: 'hidden' }}>
        <BlockLibraryPanel onBlockTap={handleAddBlock} />
        <View style={{ flex: 1 }}>
          <TimelinePanel timeline={timeline} selectedBlockId={selectedBlockId} onBlockSelect={handleBlockSelect} onBlockAdd={handleAddBlock} onBlockRemove={(id: string) => setPendingDeleteId(id)} onBlockMove={moveBlock} onBlockDuplicate={duplicateBlock} onBlockToggleCollapse={toggleBlockCollapsed} />
        </View>
        {selectedBlock && (
          <View style={{ width: 300, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface }}>
            <ScrollView style={{ flex: 1 }}>
              <PropertiesPanel block={selectedBlock} onUpdate={(u: Partial<TimelineStep>) => updateBlock(selectedBlock.id, u)} onDelete={() => setPendingDeleteId(selectedBlock.id)} onDuplicate={() => duplicateBlock(selectedBlock.id)} onClose={() => handleBlockSelect(null)} />
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
      <ConfirmDialog
        visible={pendingDeleteId !== null}
        title={t('editor.confirmDeleteBlockTitle')}
        message={t('editor.confirmDeleteBlockMessage')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDeleteId(null)}
        destructive
      />
    </View>
  );
}
