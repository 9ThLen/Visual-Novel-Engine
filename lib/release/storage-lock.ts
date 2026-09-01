/**
 * Serialize release-storage read/modify/write cycles.
 *
 * Web Locks provides the cross-tab guarantee in browsers that implement it.
 * The in-process queue covers native, tests, and browsers without Web Locks.
 * It is intentionally process-global rather than tied to a StorageLike wrapper:
 * separate wrappers can still address the same persistent backend.
 */
const processQueues = new Map<string, Promise<void>>();

export async function withReleaseStorageLock<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = processQueues.get(name) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => turn);
  processQueues.set(name, tail);

  await previous;
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request(`vne:${name}`, operation);
    }
    return await operation();
  } finally {
    release();
    if (processQueues.get(name) === tail) processQueues.delete(name);
  }
}
