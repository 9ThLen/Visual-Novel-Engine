/**
 * Runtime seeding for {@link isPlayerModeActive player mode}.
 *
 * Injects the bundled story into the app store exactly the way the home screen
 * seeds the demo stories, so the reader can look it up by id. Kept separate from
 * the pure `lib/player-mode` decision logic because it pulls in the store.
 */
import { isCanonicalStoryShape, type PlayerConfig } from '@/lib/player-mode';
import type { Story } from '@/lib/scene-operations';
import { useAppStore } from '@/stores/use-app-store';
import { StoryValidator } from '@/lib/story-validator';
import { createBundledStorySyncPayload, upsertBundledStory } from '@/lib/bundled-story-upsert';
import { StoryDomain, type CanonicalStory } from '@/lib/story-domain';

/**
 * Seed the player-mode story into the store and return its id (for routing).
 * Handles both the canonical and the legacy story shapes, mirroring the demo
 * sync path in `app/tabs/index.tsx`.
 */
export function seedPlayerStory(config: PlayerConfig): string {
  if (isCanonicalStoryShape(config.story)) {
    const story = config.story as CanonicalStory;
    const metadata = StoryDomain.extractMetadata(story);
    upsertBundledStory(metadata, story.scenes, story.characterLibrary);
    return story.id;
  }

  // Legacy shape — reuse the same validation + canonicalization the demo
  // stories go through at boot.
  const validated = StoryValidator.validateStory(config.story as Story);
  const { metadata, sceneRecords } = createBundledStorySyncPayload(validated);
  upsertBundledStory(metadata, sceneRecords);
  return metadata.id;
}

/** Resolves once the persisted store has finished rehydrating. */
function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (useAppStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = useAppStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

let seededStoryId: string | null = null;
let seedPromise: Promise<string> | undefined;

/**
 * Idempotently seed the player-mode story, waiting for persist hydration first
 * so rehydration can't clobber the seeded story. Safe to call from more than one
 * mount point — the boot gate (`app/index.tsx`) seeds on entry via `/`, and the
 * route guard seeds on every route so a deep-link or reload straight to
 * `/reader` (which never mounts `/`) still finds the story. The work runs once;
 * later callers share the same result.
 */
export function ensurePlayerStorySeeded(config: PlayerConfig): Promise<string> {
  if (seededStoryId) return Promise.resolve(seededStoryId);
  if (!seedPromise) {
    seedPromise = (async () => {
      await waitForHydration();
      const id = seedPlayerStory(config);
      seededStoryId = id;
      return id;
    })();
  }
  return seedPromise;
}
