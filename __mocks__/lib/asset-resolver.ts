export const resolvePlayableAssetUri = vi.fn().mockResolvedValue('file:///resolved/audio.mp3');
export const resolveAssetUri = vi.fn(async (uri?: string) => uri ?? null);
export const getBundledAsset = vi.fn(() => null);
export const acquireResolvedAssetUri = vi.fn(async (uri?: string) => ({
  source: uri ?? null,
  release: () => {},
}));
export const resetAssetResolverForTests = vi.fn();
export const mockResolvePlayableAssetUri = resolvePlayableAssetUri;
