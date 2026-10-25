export const resolvePlayableAssetUri = vi.fn().mockResolvedValue('file:///resolved/audio.mp3');
export const resolveAssetUri = vi.fn(async (uri?: string) => uri ?? null);
export const getBundledAsset = vi.fn(() => null);
export const acquireResolvedAssetUri = vi.fn(async (uri?: string) => ({
  source: uri ?? null,
  release: () => {},
}));
export const resetAssetResolverForTests = vi.fn();

/**
 * A published bundle points the resolver at the files it carries. The mock keeps
 * the value so a test can assert the boot sequence set it, without pulling in
 * the real resolver — see `tests/unit/lib/packaged-media-resolution.test.ts`
 * for the resolution behaviour itself.
 */
let packagedMediaMap: Record<string, string> | null = null;
export const setPackagedMediaMap = vi.fn((map: Record<string, string> | null) => {
  packagedMediaMap = map && Object.keys(map).length > 0 ? map : null;
});
export const getPackagedMediaMap = vi.fn(() => packagedMediaMap);

/** The display copies a native release carries, kept the same way. */
let packagedDisplayCopyMap: Record<string, string> | null = null;
export const setPackagedDisplayCopyMap = vi.fn((map: Record<string, string> | null) => {
  packagedDisplayCopyMap = map && Object.keys(map).length > 0 ? map : null;
});
export const getPackagedDisplayCopyUri = vi.fn((reference?: string | null) =>
  (reference && packagedDisplayCopyMap?.[reference]) || null);
export const mockResolvePlayableAssetUri = resolvePlayableAssetUri;
