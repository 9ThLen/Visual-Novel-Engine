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
  // srcdoc inherits the host CSP. Choose the inline path immediately when
  // production disallows Blob scripts/styles, rather than booting a dead frame.
  const policy = typeof document === 'undefined' ? null
    : document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');
  if (policy && ['script-src', 'style-src'].some((directive) => {
    const rules = policy.split(';').map((rule) => rule.trim().split(/\s+/));
    const sources = rules.find((rule) => rule[0] === directive) ?? rules.find((rule) => rule[0] === 'default-src');
    return sources && !sources.includes('blob:');
  })) {
    cachedAssets = null;
    return cachedAssets;
  }
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
