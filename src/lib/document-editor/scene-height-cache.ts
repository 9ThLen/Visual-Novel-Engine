/**
 * Persists measured scene frame heights (per story) so placeholders and
 * freshly mounted iframes start at their real height instead of a generic
 * minimum. Kills the visible "page grows after a moment" jump when scrolling
 * the continuous document.
 *
 * Heights are a pure optimization: on any storage failure the cache silently
 * degrades to the previous behavior (minimum-height placeholders).
 */

const STORAGE_PREFIX = 'vn-doc-scene-heights:';
const WRITE_DELAY_MS = 400;

const pendingByStory = new Map<string, Record<string, number>>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadSceneHeights(storyId: string): Record<string, number> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_PREFIX + storyId);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, number> = {};
    for (const [sceneId, height] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
        result[sceneId] = height;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function persistSceneHeight(storyId: string, sceneId: string, height: number): void {
  if (!Number.isFinite(height) || height <= 0 || !getStorage()) return;
  let pending = pendingByStory.get(storyId);
  if (!pending) {
    pending = {};
    pendingByStory.set(storyId, pending);
  }
  pending[sceneId] = Math.ceil(height);
  if (writeTimer) return;
  writeTimer = setTimeout(flushPendingHeights, WRITE_DELAY_MS);
}

function flushPendingHeights(): void {
  writeTimer = null;
  const storage = getStorage();
  if (!storage) {
    pendingByStory.clear();
    return;
  }
  pendingByStory.forEach((heights, storyId) => {
    try {
      const merged = { ...loadSceneHeights(storyId), ...heights };
      storage.setItem(STORAGE_PREFIX + storyId, JSON.stringify(merged));
    } catch {
      // Quota or serialization failure — heights are only an optimization.
    }
  });
  pendingByStory.clear();
}
