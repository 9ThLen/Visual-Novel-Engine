/**
 * components/editor/SceneComposerPhone.tsx — Phone layout for SceneComposer.
 *
 * Extracted from SceneComposer to reduce the main component's size.
 * Renders: header, tabs, panel content (blocks/timeline/properties), bottom bar.
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import type { BlockType, TimelineStep } from '@/lib/engine/types';
import { type EditorSceneDraft } from '@/lib/editor-scene-draft';
import { BlockLibraryPanel } from './BlockLibraryPanel';
import { TimelinePanel } from './TimelinePanel';
import { PropertiesPanel } from './PropertiesPanel';
import { SceneSelector } from './SceneSelector';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/lib/i18n';
import { getPhoneComposerPanel } from '@/lib/mobile-composer-layout';

export interface SceneComposerPhoneProps {
  colors: ReturnType<typeof useColors>;
  t: ReturnType<typeof useI18n>['t'];
  sceneId: string;
  sceneName: string;
  setSceneName: (name: string) => void;
  timeline: TimelineStep[];
  selectedBlockId: string | null;
  selectedBlock: TimelineStep | null;
  isDirty: boolean;
  isSaving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  showBlockLibrary: boolean;
  showProperties: boolean;
  showSceneSelector: boolean;
  pendingDeleteId: string | null;
  insetsTop: number;
  phonePanel: ReturnType<typeof getPhoneComposerPanel>;
  storyScenes: { id: string; name: string }[];
  handleBack: () => void;
  undo: () => void;
  redo: () => void;
  handlePreview: () => void;
  handleSave: () => void;
  handleDocumentEditor: () => void;
  handleSceneSelectorOpen: () => void;
  handleSceneSelectorClose: () => void;
  handleSceneImport: (blockTypes: BlockType[]) => void;
  handleConnectScenes: (fromSceneId: string, output: string, toSceneId: string, input: string) => void;
  handleBlockSelect: (stepId: string | null) => void;
  handleAddBlock: (blockType: BlockType) => void;
  moveBlock: (fromIndex: number, toIndex: number) => void;
  duplicateBlock: (id: string) => void;
  toggleBlockCollapsed: (id: string) => void;
  updateBlock: (id: string, updates: Partial<TimelineStep>) => void;
  setPendingDeleteId: (id: string | null) => void;
  handleDeleteConfirm: () => void;
  setShowBlockLibrary: React.Dispatch<React.SetStateAction<boolean>>;
  setShowProperties: React.Dispatch<React.SetStateAction<boolean>>;
}

export function SceneComposerPhone(props: SceneComposerPhoneProps) {
  const {
    colors, t, sceneId, sceneName, setSceneName,
    timeline, selectedBlockId, selectedBlock,
    isDirty, isSaving, canUndo, canRedo,
    showBlockLibrary, showProperties, showSceneSelector, pendingDeleteId,
    insetsTop, phonePanel, storyScenes,
    handleBack, undo, redo, handlePreview, handleSave,
    handleDocumentEditor, handleSceneSelectorOpen, handleSceneSelectorClose,
    handleSceneImport, handleConnectScenes,
    handleBlockSelect, handleAddBlock, moveBlock, duplicateBlock,
    toggleBlockCollapsed, updateBlock, setPendingDeleteId, handleDeleteConfirm,
    setShowBlockLibrary, setShowProperties,
  } = props;

  const phoneStyles = useMemo(() => ({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      minHeight: insetsTop + 64,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingTop: insetsTop + 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerScroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    headerContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingRight: 12,
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
      borderColor: colors.border,
      backgroundColor: `${colors.primary}12`,
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
  }), [colors, insetsTop]);

  const rotatedBackIconStyle = useMemo(() => ({ transform: [{ rotate: '180deg' }] }), []);

  return (
    <View style={phoneStyles.root}>
      {/* Header */}
      <View style={phoneStyles.header}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={phoneStyles.headerScroll} contentContainerStyle={phoneStyles.headerContent} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={handleBack}
            style={phoneStyles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t('menu.back')}
          >
            <IconSymbol name="chevron.right" size={22} color={colors.foreground} style={rotatedBackIconStyle} />
          </Pressable>

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
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{t('editor.blocks')}</Text>
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
        </ScrollView>

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
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={phoneStyles.tabs}>
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
      </ScrollView>

      {/* Panel content */}
      <View style={phoneStyles.flex}>
        {phonePanel === 'blocks' && (
          <BlockLibraryPanel onBlockTap={handleAddBlock} />
        )}
        {phonePanel === 'timeline' && (
          <View style={phoneStyles.flex}>
            <TimelinePanel
              timeline={timeline} selectedBlockId={selectedBlockId}
              onBlockSelect={handleBlockSelect} onBlockAdd={handleAddBlock}
              onBlockRemove={(id: string) => setPendingDeleteId(id)}
              onBlockMove={moveBlock} onBlockDuplicate={duplicateBlock}
              onBlockToggleCollapse={toggleBlockCollapsed}
            />
          </View>
        )}
        {phonePanel === 'properties' && selectedBlock && (
          <View style={phoneStyles.propertiesPane}>
            <ScrollView style={phoneStyles.flex}>
              <PropertiesPanel
                block={selectedBlock}
                onUpdate={(u: Partial<TimelineStep>) => updateBlock(selectedBlock.id, u)}
                onDelete={() => setPendingDeleteId(selectedBlock.id)}
                onDuplicate={() => duplicateBlock(selectedBlock.id)}
                onClose={() => handleBlockSelect(null)}
              />
            </ScrollView>
          </View>
        )}
      </View>

      {/* Bottom bar */}
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
