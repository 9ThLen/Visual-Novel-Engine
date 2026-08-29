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
  readReleasePayload,
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
  /**
   * Load a frozen release for the reader. Returns false when the release is
   * gone or damaged, so the caller can fall back rather than open an empty
   * reader.
   */
  openReleaseForReading: (storyId: string, releaseId?: string) => Promise<boolean>;
  /** Leave release playback; the reader falls back to the working copy. */
  closeReleaseReading: () => void;
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

    openReleaseForReading: async (storyId, releaseId) => {
      const releases = await listReleases(storage, storyId);
      const target = releaseId
        ? releases.find((release) => release.releaseId === releaseId)
        : currentPublishedRelease(releases);
      if (!target) return false;

      const [manifest, payload] = await Promise.all([
        readReleaseManifest(storage, storyId, target.releaseId),
        readReleasePayload(storage, storyId, target.releaseId),
      ]);
      if (!manifest || !payload) return false;

      set({
        readerRelease: {
          storyId,
          releaseId: target.releaseId,
          version: target.version,
          startSceneId: manifest.story.startSceneId,
          scenes: payload.scenes,
        },
      });
      return true;
    },

    closeReleaseReading: () => set({ readerRelease: null }),

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
