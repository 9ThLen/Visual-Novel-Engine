/**
 * hooks/useLibraryBootstrap.ts — first-run wiring for the library.
 *
 * Lifted verbatim out of the home screen when it became the showcase: hydration,
 * demo seeding, media seeding and the image-asset migration are load-bearing and
 * order-dependent, so this is a move, not a rewrite. The home screen only needs
 * to know when it is safe to render.
 */

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import demoStory from '@/assets/demo-story.json';
import demoStoryAdvanced from '@/assets/demo-story-advanced.json';
import { shouldUpsertBundledStory } from '@/lib/bundled-story-sync';
import { createBundledStorySyncPayload, upsertBundledStory } from '@/lib/bundled-story-upsert';
import { ErrorCategory, ErrorHandler } from '@/lib/error-handler';
import type { Story } from '@/lib/scene-operations';
import { migrateStoryImageAssetIds } from '@/lib/story-image-library';
import { StoryValidator } from '@/lib/story-validator';
import { cleanupOrphanedWebMedia } from '@/lib/web-media-cleanup';
import { addAssetToLibrary } from '@/stores/media-library-actions';
import { ensureStorageBootstrap } from '@/stores/storage-bootstrap';
import { useAppStore } from '@/stores/use-app-store';

function syncBundledStory(story: Story): void {
  const { metadata, sceneRecords } = createBundledStorySyncPayload(story);

  upsertBundledStory(metadata, sceneRecords);
}

export function useLibraryBootstrap(): { isInitialized: boolean } {
  const hydrateReaderSceneWindow = useAppStore((state) => state.hydrateReaderSceneWindow);
  const [isInitialized, setIsInitialized] = useState(false);

  const initializeApp = useCallback(async () => {
    // Hydration, legacy-key migration and the web media migration run in the
    // shared bootstrap (kicked off by the root layout) so that entering on any
    // route gets them; awaiting it here just joins the same run.
    const { error: bootstrapError } = await ensureStorageBootstrap();
    let initError: unknown = bootstrapError;

    // Ensure demo stories exist regardless of storage errors
    try {
      const demo1 = StoryValidator.validateStory(demoStory);
      const demo2 = StoryValidator.validateStory(demoStoryAdvanced);

      await hydrateReaderSceneWindow(demo1.id, demo1.startSceneId, 0);
      const state = useAppStore.getState();
      if (shouldUpsertBundledStory(state, demo1)) {
        if (__DEV__) {
          console.log('[useLibraryBootstrap] syncing bundled story', { storyId: demo1.id });
        }
        syncBundledStory(demo1);
      }

      await hydrateReaderSceneWindow(demo2.id, demo2.startSceneId, 0);
      const updatedState = useAppStore.getState();
      if (shouldUpsertBundledStory(updatedState, demo2)) {
        if (__DEV__) {
          console.log('[useLibraryBootstrap] syncing bundled story', { storyId: demo2.id });
        }
        syncBundledStory(demo2);
      }
    } catch (error) {
      initError = initError ?? error;
      ErrorHandler.handle('Failed to add demo stories', error, ErrorCategory.STORAGE);
    }

    // Ensure every bundled demo asset exists. This is intentionally idempotent:
    // existing user uploads and previously seeded assets are preserved.
    try {
      const bundledAssets = [
        ['assets/background/bg-ancient-library.png', 'Ancient Library', 'image'],
        ['assets/background/bg-grand-hall.png', 'Grand Hall', 'image'],
        ['assets/background/bg-hall-mirrors.png', 'Hall of Mirrors', 'image'],
        ['assets/background/bg-museum-entrance.png', 'Museum Entrance', 'image'],
        ['assets/background/bg-treasure-chamber.png', 'Treasure Chamber', 'image'],
        ['assets/background/bg-upper-library.png', 'Upper Library', 'image'],
        ['assets/sounds-sample/music-magical.mp3', 'Magical Music', 'audio'],
        ['assets/sounds-sample/music-mysterious-adventure.mp3', 'Mysterious Adventure', 'audio'],
        ['assets/sounds-sample/sfx-door-open.mp3', 'Door Open SFX', 'audio'],
      ] as const;
      for (const [uri, name, type] of bundledAssets) {
        await addAssetToLibrary(uri, name, type);
      }
    } catch (error) {
      initError = initError ?? error;
      ErrorHandler.handle('Failed to seed media library', error, ErrorCategory.STORAGE);
    }

    // Seeded and legacy images become visible only in stories that already
    // reference them as backgrounds; unrelated media remains hidden.
    useAppStore.setState((state) => ({
      imageAssetIdsByStory: migrateStoryImageAssetIds(
        state.imageAssetIdsByStory,
        state.sceneRecordsByStory,
        state.mediaLibrary,
      ),
    }));

    if (Platform.OS === 'web') {
      try {
        const cleanup = await cleanupOrphanedWebMedia(useAppStore.getState());
        if (__DEV__ && (cleanup.markedKeys.length > 0 || cleanup.deletedKeys.length > 0)) {
          console.log('[Storage] orphan media cleanup:', cleanup);
        }
      } catch (error) {
        ErrorHandler.handle('Failed to clean orphaned IndexedDB media', error, ErrorCategory.STORAGE);
      }
    }

    if (initError && __DEV__) {
      console.warn('[useLibraryBootstrap] initialization completed with errors:', initError);
    }

    setIsInitialized(true);
  }, [hydrateReaderSceneWindow]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  return { isInitialized };
}
