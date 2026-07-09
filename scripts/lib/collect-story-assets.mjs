// @ts-check
/**
 * Pure, Node-native asset-reference collection for the player-web exporter.
 *
 * Walks a story JSON object (either the legacy `Story` shape — a `scenes` map
 * with `backgroundImageUri` / `characters[].uri` / `musicUri` / nested
 * `soundUri`, etc. — or the canonical `SceneRecord + TimelineStep` shape whose
 * timeline blocks carry `assetId`) and returns every string value that looks
 * like an asset reference, classified by how the published web bundle can
 * satisfy it.
 *
 * This module has no dependencies so it can be imported by both the export
 * script (`scripts/export-story-web.mjs`) and Vitest.
 */

/** @typedef {'bundled' | 'inline' | 'remote' | 'external'} AssetRefClass */

/**
 * @typedef {Object} AssetRef
 * @property {string} uri        The raw reference string as found in the JSON.
 * @property {AssetRefClass} class How the bundle can satisfy the reference:
 *   - `bundled`  — an `assets/…` path shipped with the app web build.
 *   - `inline`   — a self-contained `data:` URI.
 *   - `remote`   — an `http(s)://` URL fetched at runtime.
 *   - `external` — a device-local reference (`file://`, `blob:`, `content://`,
 *                  media-library path) that a Node script cannot package.
 * @property {string} key        The JSON key the reference was found under.
 */

const MEDIA_EXTENSION = /\.(png|jpe?g|gif|webp|bmp|svg|mp3|wav|ogg|m4a|aac|mp4|webm|mov)$/i;

/**
 * Classify a candidate reference string, or return `null` when the value is not
 * an asset reference at all.
 * @param {unknown} value
 * @returns {AssetRefClass | null}
 */
export function classifyAssetRef(value) {
  if (typeof value !== 'string') return null;
  const uri = value.trim();
  if (!uri) return null;

  if (/^data:(image|audio|video)\//i.test(uri)) return 'inline';
  if (/^https?:\/\//i.test(uri)) {
    return MEDIA_EXTENSION.test(uri.split('?')[0]) || /media-library/i.test(uri)
      ? 'remote'
      : null;
  }
  if (/^assets\//.test(uri)) return 'bundled';
  if (/^(file|blob|content):/i.test(uri)) return 'external';
  if (/media-library/i.test(uri)) return 'external';
  return null;
}

/**
 * Recursively collect every asset reference in a parsed story object.
 * References are de-duplicated by `uri` (first occurrence wins).
 * @param {unknown} story
 * @returns {AssetRef[]}
 */
export function collectStoryAssetRefs(story) {
  /** @type {Map<string, AssetRef>} */
  const found = new Map();

  /**
   * @param {unknown} node
   * @param {string} key
   */
  const walk = (node, key) => {
    if (node == null) return;
    if (typeof node === 'string') {
      const cls = classifyAssetRef(node);
      if (cls && !found.has(node)) {
        found.set(node, { uri: node, class: cls, key });
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, key);
      return;
    }
    if (typeof node === 'object') {
      for (const [childKey, childValue] of Object.entries(node)) {
        walk(childValue, childKey);
      }
    }
  };

  walk(story, '$root');
  return [...found.values()];
}
