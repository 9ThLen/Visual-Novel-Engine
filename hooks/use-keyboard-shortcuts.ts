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

  const handleKeyDown = useCallback((event: Event) => {
    if (!enabled) return;
    const kbEvent = event as unknown as KeyboardEvent;
    const key = kbEvent.key.toLowerCase();

    for (const [id, config] of Object.entries(shortcutsRef.current)) {
      const {
        key: shortcutKey,
        ctrl = false,
        shift = false,
        alt = false,
        handler,
        preventDefault = true,
      } = config;

      if (key !== shortcutKey.toLowerCase()) continue;

      const ctrlPressed = ctrl ? isModifierKey(kbEvent) : !kbEvent.ctrlKey && !kbEvent.metaKey;
      const shiftPressed = shift ? kbEvent.shiftKey : !kbEvent.shiftKey;
      const altPressed = alt ? kbEvent.altKey : !kbEvent.altKey;

      if (ctrlPressed && shiftPressed && altPressed) {
        if (preventDefault) {
          kbEvent.preventDefault();
          kbEvent.stopPropagation();
        }
        handler();
        break;
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!enabled) return;

    const target = scope === 'global' ? window : document;
    const listener = handleKeyDown as unknown as EventListener;
    target.addEventListener('keydown', listener);
    return () => {
      target.removeEventListener('keydown', listener);
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
