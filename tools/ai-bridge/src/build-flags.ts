/**
 * Whether this code is the bundle `tools/ai-bridge/build.mjs` emits.
 *
 * `esbuild` replaces the identifier below at build time; run from source through
 * tsx it is simply not declared, and `typeof` on an undeclared name is safe.
 *
 * It exists for one decision: whether a `.env` in the working directory counts.
 * In a checkout it is the developer's, and it should. In the packaged bridge
 * there is no checkout, the working directory is wherever Explorer happened to
 * be, and a stray `.env` in it belongs to something else entirely.
 */
declare const __VNE_BUNDLED__: boolean;

export const IS_PACKAGED_BUILD: boolean =
  typeof __VNE_BUNDLED__ !== 'undefined' && __VNE_BUNDLED__ === true;
