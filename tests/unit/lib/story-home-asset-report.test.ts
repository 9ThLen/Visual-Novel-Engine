import { buildStoryAssetUsageReport } from '@/lib/story-home/asset-report';
import { getBundledAsset } from '@/lib/asset-resolver';
import type { SceneRecord } from '@/lib/engine/types';

it('counts direct bundled audio references while preserving genuinely missing references', () => {
  vi.mocked(getBundledAsset).mockImplementation((uri) => uri === 'assets/music.mp3' ? 42 : null);
  const scene = {
    id: 'scene', timeline: ['assets/music.mp3', 'assets/missing.mp3'].map((assetId) => ({
      id: assetId, enabled: true, blockType: 'music', data: { mode: 'track', assetId },
    })),
  } as SceneRecord;
  try {
    const report = buildStoryAssetUsageReport({
      storyId: 'story', scenes: [scene], mediaLibrary: [], imageAssetIdsByStory: {},
      storyAudioLibrary: [], characters: [],
    });
    expect(report.brokenReferences.map((ref) => ref.assetId)).toEqual(['assets/missing.mp3']);
    expect(report.assets.find((item) => item.asset.id === 'assets/music.mp3')?.references).toHaveLength(1);
  } finally {
    vi.mocked(getBundledAsset).mockReset();
  }
});
