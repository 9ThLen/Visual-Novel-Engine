/**
 * Decouples snapshot eviction from the AI chat journal.
 *
 * The app store owns snapshots; the AI chat store owns the undo journal whose
 * entries reference them. A direct import either way closes the cycle
 * `use-app-store → snapshots-slice → ai-chat-store → use-app-store`, and under
 * Metro's CommonJS require order that throws `Cannot access 'useAppStore'
 * before initialization` at startup. This registry has no imports, so both
 * sides can depend on it without closing a cycle.
 */
type SnapshotEvictionListener = (storyId: string, snapshotId: string) => void;

const listeners = new Set<SnapshotEvictionListener>();

export function onSnapshotEvicted(listener: SnapshotEvictionListener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function notifySnapshotEvicted(storyId: string, snapshotId: string): void {
  for (const listener of listeners) listener(storyId, snapshotId);
}
