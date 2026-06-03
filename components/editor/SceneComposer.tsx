/**
 * components/editor/SceneComposer.tsx — Main 3-panel editor layout.
 *
 * Decomposed into:
 *  • useSceneComposerShortcuts — keyboard shortcuts
 *  • SceneComposerPhone — phone layout
 *  • SceneComposerDesktop — desktop layout
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
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
import { type BlockType, type TimelineStep } from '@/lib/engine/types';
import { resolveSceneRecordForSave } from '@/lib/editor-scene-save';
import { SceneSelector } from './SceneSelector';
import { getPhoneComposerPanel } from '@/lib/mobile-composer-layout';
import { useI18n } from '@/lib/i18n';
import { SceneComposerPhone } from './SceneComposerPhone';
import { SceneComposerDesktop } from './SceneComposerDesktop';
import { useSceneComposerShortcuts } from '@/hooks/useSceneComposerShortcuts';

interface SceneComposerProps {
  storyId: string;
  sceneId: string;
  initialSceneDraft: import('@/lib/editor-scene-draft').EditorSceneDraft;
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
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phonePanel = getPhoneComposerPanel({
    showBlockLibrary,
    showProperties,
    hasSelectedBlock: Boolean(selectedBlock),
  });

  // ── Cleanup pending save-feedback timer on unmount ────────────────────
  useEffect(() => {
    return () => {
      if (savingTimerRef.current) {
        clearTimeout(savingTimerRef.current);
        savingTimerRef.current = null;
      }
    };
  }, []);

  // ── Hydrate on mount ───────────────────────────────────────────────────
  React.useEffect(() => {
    hydrateSceneDraft(initialSceneDraft);
  }, [hydrateSceneDraft, initialSceneDraft]);

  // ── Callbacks ──────────────────────────────────────────────────────────
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
    const draft = { sceneId, sceneName, timeline };
    const appState = useAppStore.getState();
    const record = resolveSceneRecordForSave(appState, storyId, sceneId, draft);
    appState.saveSceneRecord(record);
    useEditorStore.setState({ isDirty: false });
    if (savingTimerRef.current) {
      clearTimeout(savingTimerRef.current);
    }
    savingTimerRef.current = setTimeout(() => {
      setIsSaving(false);
      savingTimerRef.current = null;
    }, 500);
  }, [storyId, sceneId, sceneName, timeline, setIsSaving]);

  const handlePreview = useCallback(() => {
    router.push({ pathname: '/preview', params: { storyId, sceneId } });
  }, [storyId, sceneId, router]);

  const handleDocumentEditor = useCallback(() => {
    router.push({ pathname: '/document-editor', params: { storyId, sceneId } });
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

  // ── Keyboard shortcuts (extracted) ────────────────────────────────────
  useSceneComposerShortcuts({
    undo,
    redo,
    selectedBlockId,
    duplicateBlock,
    setPendingDeleteId,
    handleSave,
    handlePreview,
    selectBlock,
  });

  // ── Scenes list ───────────────────────────────────────────────────────
  const storyScenes = useMemo(
    () => Object.values(sceneRecordsByStory[storyId] || {}).map((record) => ({
      id: record.id,
      name: record.name || 'Untitled',
    })),
    [sceneRecordsByStory, storyId],
  );

  // ── Render: delegate to subcomponents ──────────────────────────────────
  const commonProps = {
    colors, t, sceneId, sceneName, setSceneName,
    timeline, selectedBlockId, selectedBlock,
    isDirty, isSaving, canUndo, canRedo,
    showSceneSelector, pendingDeleteId, storyScenes,
    handleBack, undo, redo, handlePreview, handleSave,
    handleDocumentEditor, handleSceneSelectorOpen, handleSceneSelectorClose,
    handleSceneImport, handleConnectScenes,
    handleBlockSelect, handleAddBlock, moveBlock, duplicateBlock,
    toggleBlockCollapsed, updateBlock, setPendingDeleteId, handleDeleteConfirm,
  };

  if (isPhone) {
    return (
      <SceneComposerPhone
        {...commonProps}
        showBlockLibrary={showBlockLibrary}
        showProperties={showProperties}
        insetsTop={insets.top}
        phonePanel={phonePanel}
        setShowBlockLibrary={setShowBlockLibrary}
        setShowProperties={setShowProperties}
      />
    );
  }

  return (
    <SceneComposerDesktop
      {...commonProps}
      showMiniPreview={showMiniPreview}
      setShowMiniPreview={setShowMiniPreview}
    />
  );
}
