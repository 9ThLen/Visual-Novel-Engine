/**
 * The player build's version of `lib/bundled-assets.ts`: nothing.
 *
 * A published novel carries its own art. `lib/story-backup/capture.ts` resolves
 * every bundled reference a story makes and packs the bytes into the release, so
 * the packaged map answers where this map used to — and `getBundledAsset` was
 * already written to stand aside when it does.
 *
 * What this removes is the ~110 MB of demo backgrounds, sample music, sprites
 * and splash art that were in every artifact because a static `require` names
 * them. Metro bundles what it can see; the only way to not ship a file is to
 * stop naming it, which is why this is a module swap rather than a flag.
 *
 * Empty rather than absent so nothing has to branch: the lookups in
 * `lib/asset-resolver.ts` miss, and their callers fall through to the release's
 * own media exactly as they do for a picture the author uploaded.
 */
export const BUNDLED_ASSETS: Record<string, number> = {};
