/**
 * A latch for "another tab has written this app state, so this tab can no
 * longer save".
 *
 * `lib/app-store-storage.ts` detects the collision but cannot report it
 * usefully on its own: it is the storage *under* the store, so it can neither
 * read the store nor touch React, and the promise it used to reject into was
 * awaited by nobody — the failure surfaced as an uncaught error overlay in
 * development and as nothing at all in production.
 *
 * So the storage reports here and stops writing, and a banner watches this.
 *
 * The latch is one-way on purpose. Once this tab's revision is stale every
 * later write collides too, and there is no safe way to merge two tabs' scene
 * edits — the honest state is "reload to continue", not "try again".
 */

type ConflictListener = (conflicted: boolean) => void;

let conflicted = false;
const listeners = new Set<ConflictListener>();

export function hasAppStateConflict(): boolean {
  return conflicted;
}

/** Called by the storage layer when a write is refused. Idempotent. */
export function reportAppStateConflict(): void {
  if (conflicted) return;
  conflicted = true;
  for (const listener of [...listeners]) listener(true);
}

export function subscribeToAppStateConflict(listener: ConflictListener): () => void {
  listeners.add(listener);
  // A tab that mounts the banner after the collision still needs to hear about
  // it, so late subscribers are told immediately.
  if (conflicted) listener(true);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: the latch is module state and would leak between cases. */
export function __resetAppStateConflictForTests(): void {
  conflicted = false;
  listeners.clear();
}
