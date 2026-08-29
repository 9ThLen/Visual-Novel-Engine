/**
 * Storage bootstrap — runs once per app start, regardless of entry route.
 *
 * The web media migration and the persistence invariant must not be bound to a
 * single screen. Entering directly on /document-editor or /reader — which a web
 * page refresh does — would otherwise leave legacy inline media unmigrated and
 * the lossy 256 KB/1 MB caps active for that whole session.
 *
 * NOTE: This file is in stores/ and can safely import useAppStore.
 */
import { Platform } from 'react-native';

import { setWebMediaReferenceInvariant } from '@/lib/app-store-persistence';
import { ErrorCategory, ErrorHandler } from '@/lib/error-handler';
import { migrateWebMediaReferences } from '@/lib/web-media-migration';
import { persistAppStoreStateNow, useAppStore } from './use-app-store';

export type StorageBootstrapResult = {
  error: unknown | null;
};

let bootstrapPromise: Promise<StorageBootstrapResult> | null = null;

function waitForHydration(): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve();
    };
    const unsubscribe = useAppStore.persist.onFinishHydration(finish);
    // Subscribe first, then re-check so hydration cannot finish between the
    // check and listener registration.
    if (useAppStore.persist.hasHydrated()) finish();
  });
}

async function runStorageBootstrap(): Promise<StorageBootstrapResult> {
  await waitForHydration();

  let error: unknown = null;

  try {
    await useAppStore.getState().migrateFromLegacyKeys();
  } catch (caught) {
    error = caught;
    ErrorHandler.handle('Failed to load stories from storage', caught, ErrorCategory.STORAGE);
  }

  if (Platform.OS === 'web') {
    try {
      const state = useAppStore.getState();
      const migrated = await migrateWebMediaReferences(
        state.mediaLibrary,
        state.characterLibraries,
      );
      if (migrated.migratedCount > 0) {
        useAppStore.setState({
          mediaLibrary: migrated.mediaLibrary,
          characterLibraries: migrated.characterLibraries,
        });
        await persistAppStoreStateNow();
      }
      // Open the gate only after both Blob writes and the canonical snapshot
      // containing their idb:// references have been committed.
      setWebMediaReferenceInvariant(true);
    } catch (caught) {
      error = error ?? caught;
      ErrorHandler.handle('Failed to migrate inline media to IndexedDB', caught, ErrorCategory.STORAGE);
    }
  }

  return { error };
}

/** Idempotent — every caller awaits the same run. */
export function ensureStorageBootstrap(): Promise<StorageBootstrapResult> {
  bootstrapPromise ??= runStorageBootstrap();
  return bootstrapPromise;
}

export function resetStorageBootstrapForTests(): void {
  bootstrapPromise = null;
}
