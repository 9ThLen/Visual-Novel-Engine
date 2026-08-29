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
  currentPublishedRelease,
  deleteRelease as deleteStoredRelease,
  listReleases,
  readReleaseManifest,
  setReleasePublished as setStoredReleasePublished,
  type ReleaseMeta,
} from '@/lib/release/release-storage';
import {
  releaseShowcaseSource,
  type ReleaseShowcaseSource,
} from '@/lib/showcase/release-showcase';
import { createPersistentStorage, type StorageLike } from '@/lib/persistent-storage';
import type { AppStoreGet, AppStoreSet } from '@/stores/app-store-slices/types';

export interface ReleasesSlice {
  loadReleasesForStory: (storyId: string) => Promise<ReleaseMeta[]>;
  /** Refresh what the showcase shows: the current published release per story. */
  loadPublishedReleases: () => Promise<void>;
  setReleasePublished: (storyId: string, releaseId: string, published: boolean) => Promise<void>;
  deleteRelease: (storyId: string, releaseId: string) => Promise<void>;
}

export function createReleasesSlice(
  set: AppStoreSet,
  get: AppStoreGet,
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

    loadPublishedReleases: async () => {
      const published: Record<string, ReleaseShowcaseSource> = {};
      for (const story of get().storiesMetadata) {
        const current = currentPublishedRelease(await listReleases(storage, story.id));
        if (!current) continue;
        const manifest = await readReleaseManifest(storage, story.id, current.releaseId);
        // A release whose manifest no longer parses is not shown rather than
        // shown broken: the shelf is the reader's side of the app.
        if (manifest) published[story.id] = releaseShowcaseSource(manifest);
      }
      set({ releaseShowcaseByStory: published });
    },

    setReleasePublished: async (storyId, releaseId, published) => {
      cache(storyId, await setStoredReleasePublished(storage, storyId, releaseId, published));
      await get().loadPublishedReleases();
    },

    deleteRelease: async (storyId, releaseId) => {
      cache(storyId, await deleteStoredRelease(storage, storyId, releaseId));
      await get().loadPublishedReleases();
    },
  };
}
