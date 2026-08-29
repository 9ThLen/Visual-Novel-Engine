/**
 * The store's view of releases: a read-through cache of the release index plus
 * the two state changes that touch nothing but storage.
 *
 * Compiling a release deliberately does **not** live here. `compileRelease`
 * reaches through `story-backup/capture`, which reads the store, so importing
 * it from a slice puts a cycle under the whole app. Publishing is orchestrated
 * by `lib/release/service.ts` and called from the screen, mirroring how
 * `lib/story-backup/service.ts` is already used.
 */
import {
  deleteRelease as deleteStoredRelease,
  listReleases,
  setReleasePublished as setStoredReleasePublished,
  type ReleaseMeta,
} from '@/lib/release/release-storage';
import { createPersistentStorage, type StorageLike } from '@/lib/persistent-storage';
import type { AppStoreSet } from '@/stores/app-store-slices/types';

export interface ReleasesSlice {
  loadReleasesForStory: (storyId: string) => Promise<ReleaseMeta[]>;
  setReleasePublished: (storyId: string, releaseId: string, published: boolean) => Promise<void>;
  deleteRelease: (storyId: string, releaseId: string) => Promise<void>;
}

export function createReleasesSlice(
  set: AppStoreSet,
  storage: StorageLike = createPersistentStorage(),
): ReleasesSlice {
  const cache = (storyId: string, releases: ReleaseMeta[]) => {
    set((state) => ({ releasesByStory: { ...state.releasesByStory, [storyId]: releases } }));
  };

  return {
    loadReleasesForStory: async (storyId) => {
      const releases = await listReleases(storage, storyId);
      cache(storyId, releases);
      return releases;
    },

    setReleasePublished: async (storyId, releaseId, published) => {
      cache(storyId, await setStoredReleasePublished(storage, storyId, releaseId, published));
    },

    deleteRelease: async (storyId, releaseId) => {
      cache(storyId, await deleteStoredRelease(storage, storyId, releaseId));
    },
  };
}
