import type { SharedEditorAssets } from './embedded-html';
import { createEmbeddedBootScript } from './embedded-script';
import { createEmbeddedStyles } from './embedded-styles';

let cachedAssets: SharedEditorAssets | null | undefined;

/**
 * Builds the shared editor script/styles once per app lifetime and exposes
 * them as Blob URLs. Every scene iframe loads the same URLs, so the browser
 * fetches from memory and reuses the compiled code instead of re-parsing the
 * full editor script inlined into each srcDoc.
 *
 * Returns null when Blob URLs are unavailable (e.g. test environments) —
 * callers fall back to the fully inlined srcDoc.
 */
export function getSharedEditorAssets(): SharedEditorAssets | null {
  if (cachedAssets !== undefined) return cachedAssets;
  if (
    typeof Blob === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
  ) {
    cachedAssets = null;
    return cachedAssets;
  }
  try {
    cachedAssets = {
      scriptUrl: URL.createObjectURL(new Blob([createEmbeddedBootScript()], { type: 'text/javascript' })),
      styleUrl: URL.createObjectURL(new Blob([createEmbeddedStyles()], { type: 'text/css' })),
    };
  } catch {
    cachedAssets = null;
  }
  return cachedAssets;
}
