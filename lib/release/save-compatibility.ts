/**
 * Does this save still fit what the reader is about to play?
 *
 * A published story moves. The scene a reader stopped on may have been
 * rewritten, renamed or deleted between versions, and loading such a save
 * silently drops them somewhere that no longer means what it meant. This says
 * which of those cases applies so the UI can be honest about it.
 *
 * Pure and total: an unknown combination is reported, never guessed at.
 */
import type { SaveSlot } from '@/lib/story-domain';

export type SaveCompatibility =
  /** Same release. Nothing to warn about. */
  | { kind: 'same' }
  /** Taken in a different version of the same story. */
  | { kind: 'otherVersion'; savedVersion: string | null; currentVersion: string }
  /**
   * Taken before releases existed, or while an author played their own draft.
   * Not an error — just unknowable, so it is named rather than assumed safe.
   */
  | { kind: 'unstamped'; currentVersion: string }
  /** Nothing is being read from a release, so there is nothing to compare to. */
  | { kind: 'noRelease' }
  /** The scene the reader stopped on is not in what is about to be played. */
  | { kind: 'missingScene'; sceneId: string };

export interface SaveCompatibilityInput {
  slot: Pick<SaveSlot, 'sceneId' | 'releaseId' | 'releaseVersion'>;
  release: { releaseId: string; version: string; sceneIds: string[] } | null;
}

export function describeSaveCompatibility(input: SaveCompatibilityInput): SaveCompatibility {
  const { slot, release } = input;
  if (!release) return { kind: 'noRelease' };

  // A missing scene outranks a version mismatch: it is the difference between
  // "this may read oddly" and "there is nowhere to put you".
  if (!release.sceneIds.includes(slot.sceneId)) {
    return { kind: 'missingScene', sceneId: slot.sceneId };
  }
  if (!slot.releaseId) return { kind: 'unstamped', currentVersion: release.version };
  if (slot.releaseId === release.releaseId) return { kind: 'same' };

  return {
    kind: 'otherVersion',
    savedVersion: slot.releaseVersion ?? null,
    currentVersion: release.version,
  };
}

/** Whether the reader should be asked before this save is loaded. */
export function needsSaveCompatibilityWarning(compatibility: SaveCompatibility): boolean {
  return compatibility.kind === 'otherVersion' || compatibility.kind === 'missingScene';
}
