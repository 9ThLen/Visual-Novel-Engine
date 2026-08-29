/**
 * Publishing, orchestrated.
 *
 * This lives in `lib/` rather than in a store slice for a concrete reason: a
 * slice that imported `compileRelease` created the cycle
 *
 *   use-app-store → releases-slice → release/compile → story-backup/capture → use-app-store
 *
 * because capture reads the store. Require cycles are allowed but hand out
 * uninitialized values, and this one sat under the whole app. The same shape is
 * why `lib/story-backup/service.ts` is called from the screen instead of the
 * store, and this follows it.
 */
import { compileRelease } from '@/lib/release/compile';
import {
  saveRelease,
  type ReleaseMeta,
} from '@/lib/release/release-storage';
import type { ReleaseChannel } from '@/lib/release/types';
import { FIRST_RELEASE_VERSION, isReleaseVersion } from '@/lib/release/version';
import { createPersistentStorage, type StorageLike } from '@/lib/persistent-storage';

export interface PublishStoryInput {
  storyId: string;
  version: string;
  channel: ReleaseChannel;
  notes?: string;
  /** Compile and keep the artifact without putting it on the showcase. */
  published?: boolean;
  storage?: StorageLike;
}

/**
 * The app's own version, read lazily.
 *
 * A static `import Constants from 'expo-constants'` makes this module
 * unimportable from a test: vitest treats expo-constants as an external package
 * and Node then loads the raw TypeScript inside `expo-modules-core`, which it
 * refuses to strip. A Vite alias does not help, because the package is never
 * handed to Vite. Nothing needs the version until someone publishes, so it is
 * read at that moment instead.
 */
function readAppVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constants = require('expo-constants') as {
      default?: { expoConfig?: { version?: string } };
      expoConfig?: { version?: string };
    };
    return constants.default?.expoConfig?.version ?? constants.expoConfig?.version;
  } catch {
    return undefined;
  }
}

/**
 * The engine version stamped into a release.
 *
 * A release version must be `MAJOR.MINOR.PATCH` and `app.config.js` is free to
 * carry something looser, so a pre-release build falls back rather than failing
 * at the last step of publishing.
 */
export function resolveEngineVersion(
  raw: string | undefined = readAppVersion(),
): string {
  return isReleaseVersion(raw) ? (raw as string) : FIRST_RELEASE_VERSION;
}

export async function publishStoryRelease(input: PublishStoryInput): Promise<ReleaseMeta> {
  const compiled = await compileRelease({
    storyId: input.storyId,
    version: input.version,
    channel: input.channel,
    notes: input.notes,
    engineVersion: resolveEngineVersion(),
  });

  return saveRelease(input.storage ?? createPersistentStorage(), {
    manifest: compiled.manifest,
    payload: compiled.payload,
    published: input.published,
  });
}
