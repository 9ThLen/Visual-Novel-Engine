/**
 * Which release a save was taken in.
 *
 * There are two ways a reader can be inside a frozen release, and a save has to
 * be stamped in both. In the studio, previewing a release puts it in
 * `state.readerRelease`. In a published player there is no such state — the
 * story arrives inlined in `index.html` and `readerRelease` is deliberately
 * always null — so the release is whatever the boot config says.
 *
 * Without this, a player's saves carried no stamp at all, and the version
 * warning R3 exists for (`lib/release/save-compatibility.ts`) could never fire:
 * a reader loading a v1 save into a v2 player would be told nothing.
 */
import { getActivePlayerConfig } from '@/lib/player-mode';
import type { ReaderReleaseSource } from '@/lib/scene-access';

export interface ReaderReleaseStamp {
  releaseId: string;
  version: string;
}

export interface ActiveReaderRelease extends ReaderReleaseStamp {
  sceneIds: string[];
}

/** The release currently being read, whether it came from preview or a player bundle. */
export function resolveActiveReaderRelease(
  readerRelease: ReaderReleaseSource | null | undefined,
  storyId: string | null | undefined,
): ActiveReaderRelease | null {
  if (readerRelease && readerRelease.storyId === storyId) {
    return {
      releaseId: readerRelease.releaseId,
      version: readerRelease.version,
      sceneIds: Object.keys(readerRelease.scenes),
    };
  }

  const config = getActivePlayerConfig();
  const release = config?.release;
  if (!config || !release) return null;
  const configStoryId = (config.story as { id?: string }).id;
  if (storyId && configStoryId && configStoryId !== storyId) return null;
  return {
    releaseId: release.releaseId,
    version: release.version,
    sceneIds: Object.keys(config.story.scenes),
  };
}

export function resolveReaderReleaseStamp(
  readerRelease: ReaderReleaseSource | null | undefined,
  storyId: string | null | undefined,
): ReaderReleaseStamp | null {
  const active = resolveActiveReaderRelease(readerRelease, storyId);
  return active ? { releaseId: active.releaseId, version: active.version } : null;
}
