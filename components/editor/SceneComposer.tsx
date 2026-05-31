/**
 * components/editor/SceneComposer.tsx — Main 3-panel editor layout
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Platform, View, Text, Pressable, TextInput, ScrollView } from 'react-native';
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
import { BLOCK_TYPE_INFO, type BlockType, type TimelineStep } from '@/lib/engine/types';
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
import { IconSymbol } from '@/components/ui/icon-symbol';

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
  const storyScenes = useMemo(
    () => Object.values(sceneRecordsByStory[storyId] || {}).map((record) => ({
      id: record.id,
      name: record.name || 'Untitled',
    })),
    [sceneRecordsByStory, storyId],
  );
  const phoneStyles = useMemo(() => ({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      minHeight: insets.top + 64,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingTop: insets.top + 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    titleWrap: { flex: 1, minWidth: 0 },
    titleInput: {
      color: colors.foreground,
      fontSize: 19,
      lineHeight: 22,
      fontWeight: '700' as const,
      padding: 0,
    },
    statusText: { color: colors.muted, fontSize: 12, lineHeight: 15 },
    undoRedoGroup: {
      flexDirection: 'row' as const,
      gap: 4,
      padding: 3,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    toolbarButton: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    blocksButton: {
      height: 34,
      paddingHorizontal: 9,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#cbd8ef',
      backgroundColor: '#eef4ff',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    previewButton: {
      width: 38,
      height: 34,
      borderRadius: 10,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: colors.primary,
    },
    tabs: {
      flexDirection: 'row' as const,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' as const },
    flex: { flex: 1 },
    propertiesPane: {
      flex: 1,
      borderLeftWidth: 0,
      borderLeftColor: colors.border,
      backgroundColor: colors.surface,
    },
    bottomBar: {
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      paddingVertical: 8,
      gap: 24,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    bottomAction: { padding: 8 },
  }), [colors, insets.top]);
  const rotatedBackIconStyle = useMemo(() => ({ transform: [{ rotate: '180deg' }] }), []);

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

  const handleDocumentEditor = useCallback(() => {
    router.push({ pathname: '/document-editor', params: { storyId, sceneId } } as never);
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
        handler: () => {
          if (Platform.OS !== 'web' || typeof document === 'undefined') return;
          document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
        },
      },
    },
  });

  // Phone layout
  if (isPhone) {
    return (
      <View style={phoneStyles.root}>
        <View style={phoneStyles.header}>
          <Pressable
            onPress={handleBack}
            style={phoneStyles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t('menu.back')}
          >
            <IconSymbol name="chevron.right" size={22} color={colors.foreground} style={rotatedBackIconStyle} />
          </Pressable>

          <View style={phoneStyles.titleWrap}>
            <TextInput
              value={sceneName} onChangeText={setSceneName}
              style={phoneStyles.titleInput}
              placeholder={t('editor.sceneName')} placeholderTextColor={colors.muted}
              accessibilityLabel={t('editor.sceneName')}
            />
            <Text style={phoneStyles.statusText} numberOfLines={1}>
              {isSaving ? t('common.saving') : isDirty ? t('editor.unsaved') : t('editor.saved')}
            </Text>
          </View>

          <View style={phoneStyles.undoRedoGroup}>
            <Pressable onPress={undo} disabled={!canUndo} style={[phoneStyles.toolbarButton, { opacity: canUndo ? 1 : 0.35 }]} accessibilityRole="button" accessibilityLabel={t('editor.undo')}>
              <IconSymbol name="undo" size={17} color={colors.muted} />
            </Pressable>
            <Pressable onPress={redo} disabled={!canRedo} style={[phoneStyles.toolbarButton, { opacity: canRedo ? 1 : 0.35 }]} accessibilityRole="button" accessibilityLabel={t('editor.redo')}>
              <IconSymbol name="redo" size={17} color={colors.muted} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => { setShowBlockLibrary((value) => !value); setShowProperties(false); }}
            style={phoneStyles.blocksButton}
            accessibilityRole="button"
            accessibilityLabel={t('editor.blocks')}
          >
            <Text style={{ color: '#1f4f9f', fontSize: 12, fontWeight: '700' }}>{t('editor.blocks')}</Text>
          </Pressable>

          <Pressable
            onPress={handlePreview}
            style={phoneStyles.previewButton}
            accessibilityRole="button"
            accessibilityLabel={t('editor.preview')}
          >
            <IconSymbol name="play" size={20} color={colors['text-inverse']} />
          </Pressable>

          <Pressable onPress={handleSave} style={phoneStyles.iconButton} accessibilityRole="button" accessibilityLabel={t('editor.save')}>
            <IconSymbol name="save" size={19} color={colors.primary} />
          </Pressable>
        </View>

        <View style={phoneStyles.tabs}>
          <Pressable
            onPress={() => { setShowBlockLibrary(true); setShowProperties(false); }}
            style={phoneStyles.tab}
            accessibilityRole="button"
            accessibilityLabel={t('editor.blocks')}
          >
            <Text style={{ color: showBlockLibrary ? colors.primary : colors.muted, fontSize: 12, fontWeight: '600' }}>{t('editor.blocks')}</Text>
          </Pressable>
          <Pressable
            onPress={() => { setShowBlockLibrary(false); setShowProperties(false); }}
            style={phoneStyles.tab}
            accessibilityRole="button"
            accessibilityLabel={t('editor.timeline')}
          >
            <Text style={{ color: !showBlockLibrary && !showProperties ? colors.primary : colors.muted, fontSize: 12, fontWeight: '600' }}>{t('editor.timeline')}</Text>
          </Pressable>
          <Pressable onPress={handlePreview} style={phoneStyles.tab} accessibilityRole="button" accessibilityLabel={t('editor.preview')}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{t('editor.preview')}</Text>
          </Pressable>
          <Pressable onPress={handleDocumentEditor} style={phoneStyles.tab} accessibilityRole="button" accessibilityLabel={t('editor.documentEditor')}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{t('editor.document')}</Text>
          </Pressable>
          <Pressable onPress={handleSceneSelectorOpen} style={phoneStyles.tab} accessibilityRole="button" accessibilityLabel={t('editor.scenes')}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{t('editor.scenes')}</Text>
          </Pressable>
        </View>

        <View style={phoneStyles.flex}>
          {phonePanel === 'blocks' && (
            <BlockLibraryPanel onBlockTap={handleAddBlock} />
          )}
          {phonePanel === 'timeline' && (
            <View style={phoneStyles.flex}>
              <TimelinePanel timeline={timeline} selectedBlockId={selectedBlockId} onBlockSelect={handleBlockSelect} onBlockAdd={handleAddBlock} onBlockRemove={(id: string) => setPendingDeleteId(id)} onBlockMove={moveBlock} onBlockDuplicate={duplicateBlock} onBlockToggleCollapse={toggleBlockCollapsed} />
            </View>
          )}
          {phonePanel === 'properties' && selectedBlock && (
            <View style={phoneStyles.propertiesPane}>
              <ScrollView style={phoneStyles.flex}>
                <PropertiesPanel block={selectedBlock} onUpdate={(u: Partial<TimelineStep>) => updateBlock(selectedBlock.id, u)} onDelete={() => setPendingDeleteId(selectedBlock.id)} onDuplicate={() => duplicateBlock(selectedBlock.id)} onClose={() => handleBlockSelect(null)} />
              </ScrollView>
            </View>
          )}
        </View>

        {/* Undo/Redo bar for phone */}
        <View style={phoneStyles.bottomBar}>
          <Pressable onPress={undo} disabled={!canUndo} style={[phoneStyles.bottomAction, { opacity: canUndo ? 1 : 0.3 }]} accessibilityRole="button" accessibilityLabel={t('editor.undo')}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t('editor.undo')}</Text>
          </Pressable>
          <Pressable onPress={redo} disabled={!canRedo} style={[phoneStyles.bottomAction, { opacity: canRedo ? 1 : 0.3 }]} accessibilityRole="button" accessibilityLabel={t('editor.redo')}>
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
    <View style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e3e6eb', backgroundColor: 'rgba(255,255,255,0.94)' }}>
        <Pressable onPress={handleBack} style={{ width: 300, height: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderRightWidth: 1, borderRightColor: '#e3e6eb' }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
          <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: '#e3e6eb', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="chevron.right" size={18} color="#2667d9" style={{ transform: [{ rotate: '180deg' }] }} />
          </View>
          <Text style={{ color: '#252a32', fontSize: 15, fontWeight: '700' }}>VN Studio</Text>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 18 }}>
          <Text style={{ color: '#7b828d', fontSize: 14 }} numberOfLines={1}>
            {t('editor.sceneEditor')} / <Text style={{ color: '#252a32', fontWeight: '700' }}>{sceneName || t('editor.sceneName')}</Text>
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18 }}>
          <Pressable onPress={handleDocumentEditor} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e3e6eb', backgroundColor: '#ffffff' }} accessibilityRole="button" accessibilityLabel={t('editor.documentEditor')}>
            <IconSymbol name="document" size={15} color="#252a32" />
            <Text style={{ color: '#252a32', fontSize: 13, fontWeight: '600' }}>{t('editor.document')}</Text>
          </Pressable>
          <Pressable onPress={undo} disabled={!canUndo} style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#e3e6eb', backgroundColor: '#ffffff', opacity: canUndo ? 1 : 0.35 }} accessibilityRole="button" accessibilityLabel={t('editor.undo')}>
            <IconSymbol name="undo" size={18} color="#252a32" />
          </Pressable>
          <Pressable onPress={redo} disabled={!canRedo} style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#e3e6eb', backgroundColor: '#ffffff', opacity: canRedo ? 1 : 0.35 }} accessibilityRole="button" accessibilityLabel={t('editor.redo')}>
            <IconSymbol name="redo" size={18} color="#252a32" />
          </Pressable>
          <Pressable onPress={handleSceneSelectorOpen} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e3e6eb', backgroundColor: '#ffffff' }} accessibilityRole="button" accessibilityLabel={t('editor.scenes')}>
            <IconSymbol name="timeline" size={15} color="#252a32" />
            <Text style={{ color: '#252a32', fontSize: 13, fontWeight: '600' }}>{t('editor.scenes')}</Text>
          </Pressable>
          <Pressable onPress={handlePreview} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1e5fd0', backgroundColor: '#2667d9' }} accessibilityRole="button" accessibilityLabel={t('editor.preview')}>
            <IconSymbol name="play" size={16} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{t('editor.preview')}</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1e5fd0', backgroundColor: '#2667d9' }} accessibilityRole="button" accessibilityLabel={t('editor.save')}>
            <IconSymbol name="save" size={15} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>
              {isSaving ? t('common.saving') : isDirty ? t('editor.unsaved') : t('editor.saved')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <View style={{ width: 300, backgroundColor: '#fbfcfd', borderRightWidth: 1, borderRightColor: '#e3e6eb' }}>
          <BlockLibraryPanel onBlockTap={handleAddBlock} />
        </View>

        <View style={{ flex: 1, minWidth: 520, backgroundColor: '#f8f9fb' }}>
          <View style={{ flex: 1, padding: 34, alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 860, minHeight: 980, flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e3e6eb', borderRadius: 8, shadowColor: '#222936', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.10, shadowRadius: 55, elevation: 8 }}>
              <View style={{ paddingHorizontal: 56, paddingTop: 42, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#e3e6eb' }}>
                <TextInput value={sceneName} onChangeText={setSceneName} style={{ color: '#252a32', fontSize: 38, lineHeight: 42, fontWeight: '700', padding: 0 }} placeholder={t('editor.sceneName')} placeholderTextColor="#7b828d" accessibilityLabel={t('editor.sceneName')} />
                <Text style={{ color: '#7b828d', fontSize: 18, marginTop: 8 }}>
                  {timeline.length} block{timeline.length !== 1 ? 's' : ''} / {isDirty ? t('editor.unsaved') : t('editor.saved')}
                </Text>
              </View>
              <TimelinePanel timeline={timeline} selectedBlockId={selectedBlockId} onBlockSelect={handleBlockSelect} onBlockAdd={handleAddBlock} onBlockRemove={(id: string) => setPendingDeleteId(id)} onBlockMove={moveBlock} onBlockDuplicate={duplicateBlock} onBlockToggleCollapse={toggleBlockCollapsed} />
            </View>
          </View>
          <View style={{ height: 50, borderTopWidth: 1, borderTopColor: '#e3e6eb', backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
            <Text style={{ color: '#7b828d', fontSize: 13 }}>{sceneId}</Text>
            <Text style={{ color: '#7b828d', fontSize: 13 }}>{selectedBlock ? BLOCK_TYPE_INFO[selectedBlock.blockType].label : t('editor.timeline')}</Text>
          </View>
        </View>

        <View style={{ width: 360, backgroundColor: '#fbfcfd', borderLeftWidth: 1, borderLeftColor: '#e3e6eb' }}>
          {selectedBlock ? (
            <ScrollView style={{ flex: 1 }}>
              <PropertiesPanel block={selectedBlock} onUpdate={(u: Partial<TimelineStep>) => updateBlock(selectedBlock.id, u)} onDelete={() => setPendingDeleteId(selectedBlock.id)} onDuplicate={() => duplicateBlock(selectedBlock.id)} onClose={() => handleBlockSelect(null)} />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={{ height: 54, justifyContent: 'center', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#e3e6eb', backgroundColor: 'rgba(251,252,253,0.94)' }}>
                <Text style={{ color: '#252a32', fontSize: 15, fontWeight: '700' }}>{t('editor.properties')}</Text>
              </View>
              <View style={{ padding: 18 }}>
                {showMiniPreview && (
                  <MiniPreview timeline={timeline} onClose={() => setShowMiniPreview(false)} />
                )}
                <Text style={{ color: '#7b828d', fontSize: 13, lineHeight: 19, marginTop: 18 }}>
                  {t('editor.selectBlockHint', undefined, 'Select a block to edit its properties.')}
                </Text>
              </View>
            </View>
          )}
        </View>
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
