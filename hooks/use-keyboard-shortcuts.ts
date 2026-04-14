/**
 * Keyboard Shortcuts Hook
 * Platform-aware keyboard shortcut system for web
 */

import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { isModifierKey } from '@/lib/web-utils';

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description?: string;
  preventDefault?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  shortcuts: Record<string, ShortcutConfig & { handler: () => void }>;
  enabled?: boolean;
  scope?: 'global' | 'local';
}

/**
 * Hook for registering keyboard shortcuts
 * Only works on web platform
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  scope = 'global',
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);

  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    const key = event.key.toLowerCase();

    // Check each registered shortcut
    for (const [id, config] of Object.entries(shortcutsRef.current)) {
      const {
        key: shortcutKey,
        ctrl = false,
        shift = false,
        alt = false,
        handler,
        preventDefault = true,
      } = config;

      // Check if key matches
      if (key !== shortcutKey.toLowerCase()) continue;

      // Check modifiers
      const ctrlPressed = ctrl ? isModifierKey(event) : !event.ctrlKey && !event.metaKey;
      const shiftPressed = shift ? event.shiftKey : !event.shiftKey;
      const altPressed = alt ? event.altKey : !event.altKey;

      if (ctrlPressed && shiftPressed && altPressed) {
        if (preventDefault) {
          event.preventDefault();
          event.stopPropagation();
        }
        handler();
        break;
      }
    }
  }, [enabled]);

  useEffect(() => {
    // Only register on web
    if (Platform.OS !== 'web') return;
    if (!enabled) return;

    const target = scope === 'global' ? window : document;
    target.addEventListener('keydown', handleKeyDown as any);

    return () => {
      target.removeEventListener('keydown', handleKeyDown as any);
    };
  }, [handleKeyDown, enabled, scope]);

  return {
    isWeb: Platform.OS === 'web',
  };
}

/**
 * Common keyboard shortcuts
 */
export const COMMON_SHORTCUTS = {
  save: { key: 's', ctrl: true, description: 'Save' },
  preview: { key: 'p', ctrl: true, description: 'Preview' },
  new: { key: 'n', ctrl: true, description: 'New' },
  find: { key: 'f', ctrl: true, description: 'Find' },
  undo: { key: 'z', ctrl: true, description: 'Undo' },
  redo: { key: 'y', ctrl: true, description: 'Redo' },
  duplicate: { key: 'd', ctrl: true, description: 'Duplicate' },
  delete: { key: 'delete', description: 'Delete' },
  escape: { key: 'escape', description: 'Close' },
  space: { key: ' ', description: 'Continue' },
  enter: { key: 'enter', description: 'Confirm' },
} as const;

/**
 * Hook for common save shortcut (Ctrl/Cmd+S)
 */
export function useSaveShortcut(onSave: () => void, enabled = true) {
  return useKeyboardShortcuts({
    shortcuts: {
      save: {
        ...COMMON_SHORTCUTS.save,
        handler: onSave,
      },
    },
    enabled,
  });
}

/**
 * Hook for common preview shortcut (Ctrl/Cmd+P)
 */
export function usePreviewShortcut(onPreview: () => void, enabled = true) {
  return useKeyboardShortcuts({
    shortcuts: {
      preview: {
        ...COMMON_SHORTCUTS.preview,
        handler: onPreview,
      },
    },
    enabled,
  });
}

/**
 * Hook for escape key (close modals, etc.)
 */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  return useKeyboardShortcuts({
    shortcuts: {
      escape: {
        ...COMMON_SHORTCUTS.escape,
        handler: onEscape,
      },
    },
    enabled,
  });
}

/**
 * Hook for editor shortcuts (undo, redo, duplicate, delete)
 */
export function useEditorShortcuts({
  onUndo,
  onRedo,
  onDuplicate,
  onDelete,
  enabled = true,
}: {
  onUndo?: () => void;
  onRedo?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  enabled?: boolean;
}) {
  const shortcuts: Record<string, ShortcutConfig & { handler: () => void }> = {};

  if (onUndo) {
    shortcuts.undo = { ...COMMON_SHORTCUTS.undo, handler: onUndo };
  }
  if (onRedo) {
    shortcuts.redo = { ...COMMON_SHORTCUTS.redo, handler: onRedo };
  }
  if (onDuplicate) {
    shortcuts.duplicate = { ...COMMON_SHORTCUTS.duplicate, handler: onDuplicate };
  }
  if (onDelete) {
    shortcuts.delete = { ...COMMON_SHORTCUTS.delete, handler: onDelete };
  }

  return useKeyboardShortcuts({ shortcuts, enabled });
}

/**
 * Hook for reader shortcuts (space, arrows, etc.)
 */
export function useReaderShortcuts({
  onContinue,
  onToggleHistory,
  onToggleAuto,
  enabled = true,
}: {
  onContinue?: () => void;
  onToggleHistory?: () => void;
  onToggleAuto?: () => void;
  enabled?: boolean;
}) {
  const shortcuts: Record<string, ShortcutConfig & { handler: () => void }> = {};

  if (onContinue) {
    shortcuts.space = { ...COMMON_SHORTCUTS.space, handler: onContinue };
  }
  if (onToggleHistory) {
    shortcuts.history = { key: 'h', description: 'Toggle History', handler: onToggleHistory };
  }
  if (onToggleAuto) {
    shortcuts.auto = { key: 'a', description: 'Toggle Auto-play', handler: onToggleAuto };
  }

  return useKeyboardShortcuts({ shortcuts, enabled });
}
