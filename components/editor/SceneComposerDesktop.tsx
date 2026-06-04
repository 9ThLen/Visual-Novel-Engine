/**
 * components/editor/SceneComposerDesktop.tsx — Desktop layout for SceneComposer.
 *
 * Extracted from SceneComposer to reduce the main component's size.
 * Renders: top toolbar, 3-panel layout (blocks, timeline, properties).
 */
import React from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import type { BlockType, TimelineStep } from '@/lib/engine/types';
import type { EditorSceneDraft } from '@/lib/editor-scene-draft';
import { BLOCK_TYPE_INFO } from '@/lib/engine/types';
import { BlockLibraryPanel } from './BlockLibraryPanel';
import { TimelinePanel } from './TimelinePanel';
import { PropertiesPanel } from './PropertiesPanel';
import { MiniPreview } from './MiniPreview';
import { SceneSelector } from './SceneSelector';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { useI18n } from '@/lib/i18n';

interface SceneComposerDesktopProps {
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
  showMiniPreview: boolean;
  showSceneSelector: boolean;
  pendingDeleteId: string | null;
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
  setShowMiniPreview: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingDeleteId: (id: string | null) => void;
  handleDeleteConfirm: () => void;
}

export function SceneComposerDesktop(props: SceneComposerDesktopProps) {
  const {
    colors, t, sceneId, sceneName, setSceneName,
    timeline, selectedBlockId, selectedBlock,
    isDirty, isSaving, canUndo, canRedo,
    showMiniPreview, showSceneSelector, pendingDeleteId,
    storyScenes, handleBack, undo, redo, handlePreview, handleSave,
    handleDocumentEditor, handleSceneSelectorOpen, handleSceneSelectorClose,
    handleSceneImport, handleConnectScenes,
    handleBlockSelect, handleAddBlock, moveBlock, duplicateBlock,
    toggleBlockCollapsed, updateBlock, setShowMiniPreview,
    setPendingDeleteId, handleDeleteConfirm,
  } = props;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Top toolbar */}
      <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
        <Pressable onPress={handleBack} style={{ width: 300, height: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderRightWidth: 1, borderRightColor: colors.border }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
          <View style={{ width: 28, height: 28, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="chevron.right" size={18} color={colors.primary} style={{ transform: [{ rotate: '180deg' }] }} />
          </View>
          <Text style={{ color: colors.foreground, ...typeScale.label, fontWeight: '700' }}>{t('home.productName')}</Text>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: spacing.lg }}>
          <Text style={{ color: colors.muted, ...typeScale.label }} numberOfLines={1}>
            {t('editor.sceneEditor')} / <Text style={{ color: colors.foreground, fontWeight: '700' }}>{sceneName || t('editor.sceneName')}</Text>
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          <Pressable onPress={handleDocumentEditor} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }} accessibilityRole="button" accessibilityLabel={t('editor.documentEditor')}>
            <IconSymbol name="document" size={15} color={colors.foreground} />
            <Text style={{ color: colors.foreground, ...typeScale.caption }}>{t('editor.document')}</Text>
          </Pressable>
          <Pressable onPress={undo} disabled={!canUndo} style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, opacity: canUndo ? 1 : 0.35 }} accessibilityRole="button" accessibilityLabel={t('editor.undo')}>
            <IconSymbol name="undo" size={18} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={redo} disabled={!canRedo} style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, opacity: canRedo ? 1 : 0.35 }} accessibilityRole="button" accessibilityLabel={t('editor.redo')}>
            <IconSymbol name="redo" size={18} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={handleSceneSelectorOpen} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }} accessibilityRole="button" accessibilityLabel={t('editor.scenes')}>
            <IconSymbol name="timeline" size={15} color={colors.foreground} />
            <Text style={{ color: colors.foreground, ...typeScale.caption }}>{t('editor.scenes')}</Text>
          </Pressable>
          <Pressable onPress={handlePreview} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary }} accessibilityRole="button" accessibilityLabel={t('editor.preview')}>
            <IconSymbol name="play" size={16} color={colors['text-inverse']} />
            <Text style={{ color: colors['text-inverse'], ...typeScale.caption, fontWeight: '700' }}>{t('editor.preview')}</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary }} accessibilityRole="button" accessibilityLabel={t('editor.save')}>
            <IconSymbol name="save" size={15} color={colors['text-inverse']} />
            <Text style={{ color: colors['text-inverse'], ...typeScale.caption, fontWeight: '700' }}>
              {isSaving ? t('common.saving') : isDirty ? t('editor.unsaved') : t('editor.saved')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 3-panel layout */}
      <View style={{ flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Block library */}
        <View style={{ width: 300, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border }}>
          <BlockLibraryPanel onBlockTap={handleAddBlock} />
        </View>

        {/* Timeline */}
        <View style={{ flex: 1, minWidth: 520, backgroundColor: colors.background }}>
          <View style={{ flex: 1, padding: spacing['2xl'], alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 860, minHeight: 980, flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, shadowColor: colors.foreground, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.10, shadowRadius: 55, elevation: 8 }}>
              <View style={{ paddingHorizontal: spacing['3xl'], paddingTop: spacing['3xl'], paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TextInput value={sceneName} onChangeText={setSceneName} style={{ color: colors.foreground, fontSize: 38, lineHeight: 42, fontWeight: '700', padding: 0 }} placeholder={t('editor.sceneName')} placeholderTextColor={colors.muted} accessibilityLabel={t('editor.sceneName')} />
                <Text style={{ color: colors.muted, ...typeScale.label, marginTop: spacing.sm }}>
                  {t('editor.blockCountStatus', {
                    count: timeline.length,
                    status: isDirty ? t('editor.unsaved') : t('editor.saved'),
                  })}
                </Text>
              </View>
              <TimelinePanel
                timeline={timeline} selectedBlockId={selectedBlockId}
                onBlockSelect={handleBlockSelect} onBlockAdd={handleAddBlock}
                onBlockRemove={(id: string) => setPendingDeleteId(id)}
                onBlockMove={moveBlock} onBlockDuplicate={duplicateBlock}
                onBlockToggleCollapse={toggleBlockCollapsed}
              />
            </View>
          </View>
          <View style={{ height: 50, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
            <Text style={{ color: colors.muted, ...typeScale.caption }}>{sceneId}</Text>
            <Text style={{ color: colors.muted, ...typeScale.caption }}>{selectedBlock ? BLOCK_TYPE_INFO[selectedBlock.blockType].label : t('editor.timeline')}</Text>
          </View>
        </View>

        {/* Properties */}
        <View style={{ width: 360, backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border }}>
          {selectedBlock ? (
            <ScrollView style={{ flex: 1 }}>
              <PropertiesPanel
                block={selectedBlock}
                onUpdate={(u: Partial<TimelineStep>) => updateBlock(selectedBlock.id, u)}
                onDelete={() => setPendingDeleteId(selectedBlock.id)}
                onDuplicate={() => duplicateBlock(selectedBlock.id)}
                onClose={() => handleBlockSelect(null)}
              />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={{ height: 54, justifyContent: 'center', paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
                <Text style={{ color: colors.foreground, ...typeScale.label, fontWeight: '700' }}>{t('editor.properties')}</Text>
              </View>
              <View style={{ padding: spacing.lg }}>
                {showMiniPreview && (
                  <MiniPreview timeline={timeline} onClose={() => setShowMiniPreview(false)} />
                )}
                <Text style={{ color: colors.muted, ...typeScale.caption, lineHeight: 19, marginTop: spacing.lg }}>
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
