import { useCallback, useEffect, useRef, useState } from 'react';

import { createPersistentStorage } from '@/lib/persistent-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  DEFAULT_PREVIEW_DEVICE,
  sanitizePreviewDevice,
  type PreviewDevice,
} from '@/lib/document-editor/preview-viewport';

/**
 * The author's preview device choice, remembered across sessions.
 *
 * This is editor chrome, not a reader preference, so it stays out of
 * `UserSettings` (which is sanitized, migrated and exported with the story)
 * and lives under its own storage key.
 */
export function useEditorPreviewDevice(): [PreviewDevice, (device: PreviewDevice) => void] {
  const [device, setDevice] = useState<PreviewDevice>(DEFAULT_PREVIEW_DEVICE);
  const storageRef = useRef<ReturnType<typeof createPersistentStorage> | null>(null);

  if (storageRef.current === null) {
    storageRef.current = createPersistentStorage();
  }

  useEffect(() => {
    let active = true;
    void Promise.resolve(storageRef.current?.getItem(STORAGE_KEYS.EDITOR_PREVIEW_DEVICE))
      .then((stored) => {
        if (active && stored) setDevice(sanitizePreviewDevice(stored));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const select = useCallback((next: PreviewDevice) => {
    const sanitized = sanitizePreviewDevice(next);
    setDevice(sanitized);
    void Promise.resolve(storageRef.current?.setItem(STORAGE_KEYS.EDITOR_PREVIEW_DEVICE, sanitized)).catch(() => {});
  }, []);

  return [device, select];
}
