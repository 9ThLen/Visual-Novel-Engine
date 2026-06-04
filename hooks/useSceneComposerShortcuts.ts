/**
 * hooks/useSceneComposerShortcuts.ts — Keyboard shortcuts for SceneComposer.
 *
 * Extracts keyboard shortcut registration from SceneComposer to reduce
 * its hook count. Wraps useEditorShortcuts + useKeyboardShortcuts.
 */
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useEditorShortcuts, useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/use-keyboard-shortcuts';

export function useSceneComposerShortcuts({
  undo,
  redo,
  selectedBlockId,
  duplicateBlock,
  setPendingDeleteId,
  handleSave,
  handlePreview,
  selectBlock,
}: {
  undo: () => void;
  redo: () => void;
  selectedBlockId: string | null;
  duplicateBlock: (id: string) => void;
  setPendingDeleteId: (id: string | null) => void;
  handleSave: () => void;
  handlePreview: () => void;
  selectBlock: (id: string | null) => void;
}) {
  const handleDuplicate = selectedBlockId
    ? () => duplicateBlock(selectedBlockId)
    : undefined;
  const handleDelete = selectedBlockId
    ? () => setPendingDeleteId(selectedBlockId)
    : undefined;

  useEditorShortcuts({
    onUndo: undo,
    onRedo: redo,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
  });

  // Additional shortcuts not covered by useEditorShortcuts
  useKeyboardShortcuts({
    shortcuts: {
      redo_shiftz: { key: 'z', ctrl: true, shift: true, handler: redo },
      save: { ...COMMON_SHORTCUTS.save, handler: handleSave },
      preview: { ...COMMON_SHORTCUTS.preview, handler: handlePreview },
      escape: {
        ...COMMON_SHORTCUTS.escape,
        handler: () => selectBlock(null),
      },
      delete_backspace: {
        key: 'backspace',
        handler: () => {
          if (selectedBlockId) setPendingDeleteId(selectedBlockId);
        },
      },
      focus_search: {
        key: 'a',
        ctrl: true,
        handler: () => {
          if (Platform.OS !== 'web' || typeof document === 'undefined') return;
          document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
        },
      },
    },
  });
}
