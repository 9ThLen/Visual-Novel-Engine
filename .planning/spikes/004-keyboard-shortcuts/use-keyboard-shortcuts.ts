/**
 * hooks/useKeyboardShortcuts.ts — Keyboard shortcuts for the editor on web/desktop
 *
 * Platform-guarded: only fires on web (won't break native keyboard).
 * Normalizes Ctrl/Meta, handles key name mapping (Delete, Escape, etc.).
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handler = (e: KeyboardEvent) => {
      const parts: string[] = [];

      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      let key = e.key;
      // Skip modifier-only keys
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;
      // Normalize single characters
      if (key.length === 1) key = key.toUpperCase();

      parts.push(key);
      const combo = parts.join('+');
      const action = shortcutsRef.current[combo];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        action();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

/**
 * Usage in SceneComposer.tsx:
 *
 * const { selectedBlockId } = useEditorStore();
 * const { undo, redo, removeBlock, duplicateBlock, selectBlock } = useEditorStore();
 * const handleSave = useCallback(() => { ... }, [storyId, sceneId, sceneName, timeline]);
 * const handlePreview = useCallback(() => { ... }, [storyId, sceneId]);
 * const searchInputRef = useRef<TextInput>(null);
 *
 * useKeyboardShortcuts({
 *   'Ctrl+Z':       undo,
 *   'Ctrl+Shift+Z': redo,
 *   'Ctrl+Y':       redo,
 *   'Delete':       () => selectedBlockId && removeBlock(selectedBlockId),
 *   'Backspace':    () => selectedBlockId && removeBlock(selectedBlockId),
 *   'Ctrl+D':       () => selectedBlockId && duplicateBlock(selectedBlockId),
 *   'Ctrl+S':       handleSave,
 *   'Escape':       () => selectBlock(null),
 *   'Ctrl+P':       handlePreview,
 *   'Ctrl+A':       () => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus(),
 * });
 */
