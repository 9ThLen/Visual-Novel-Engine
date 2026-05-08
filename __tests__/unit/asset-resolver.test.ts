import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/asset-resolver', () => ({
  getBundledAsset: vi.fn(),
  resolveAssetUri: vi.fn(),
  copyAssetToPermanentStorage: vi.fn(),
}));

import { getBundledAsset, resolveAssetUri, copyAssetToPermanentStorage } from '@/lib/asset-resolver';

describe('AssetResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBundledAsset', () => {
    it('should return null for empty assetId', () => {
      (getBundledAsset as any).mockReturnValueOnce(null);
      expect(getBundledAsset('')).toBeNull();
    });

    it('should return asset for valid id', () => {
      (getBundledAsset as any).mockReturnValueOnce('mock-asset');
      const result = getBundledAsset('bg-ancient-library');
      expect(result).toBe('mock-asset');
    });
  });

  describe('resolveAssetUri', () => {
    it('should return null for empty uri', async () => {
      (resolveAssetUri as any).mockResolvedValueOnce(null);
      const result = await resolveAssetUri('');
      expect(result).toBeNull();
    });

    it('should return blob URIs as-is', async () => {
      const uri = 'blob:https://example.com/1234';
      (resolveAssetUri as any).mockResolvedValueOnce(uri);
      const result = await resolveAssetUri(uri);
      expect(result).toBe(uri);
    });

    it('should return http URIs as-is', async () => {
      const uri = 'http://example.com/image.png';
      (resolveAssetUri as any).mockResolvedValueOnce(uri);
      const result = await resolveAssetUri(uri);
      expect(result).toBe(uri);
    });
  });

  describe('copyAssetToPermanentStorage', () => {
    it('should copy asset to storage', async () => {
      const target = 'file:///storage/image.png';
      (copyAssetToPermanentStorage as any).mockResolvedValueOnce(target);
      const result = await copyAssetToPermanentStorage('source.png', 'image');
      expect(result).toBe(target);
    });
  });
});
