import { buildAvailableAssets } from '@/lib/asset-usage';

describe('buildAvailableAssets', () => {
  it('uses ids and URI aliases for backgrounds, audio, and sprites', () => {
    const assets = buildAvailableAssets(
      [{ id: 'bg', type: 'image', uri: 'bg-uri', name: 'BG', addedAt: 1 }],
      [{ id: 'song', type: 'music', uri: 'song-uri', name: 'Song', createdAt: 1 }],
      [{ id: 'c', name: 'Alice', createdAt: 1, sprites: [{ id: 's', name: 'Smile', uri: 'sprite-uri', createdAt: 1 }] }],
    );
    expect(assets.map(({ id }) => id)).toEqual(['bg', 'song', 'c:s']);
    expect(assets[2].aliases).toEqual(['s', 'sprite-uri']);
  });

  // The membership migration checks both fields (story-media-library.ts), so a
  // sprite whose runtime `uri` is a blob must still match a reference written
  // against its persistent URI — otherwise usage and membership disagree about
  // what "the same sprite" means.
  it('also aliases the persistent assetUri when the runtime uri is a blob', () => {
    const assets = buildAvailableAssets(
      [],
      [],
      [{
        id: 'c',
        name: 'Alice',
        createdAt: 1,
        sprites: [{ id: 's', name: 'Smile', uri: 'blob:preview', assetUri: 'file://smile.png', createdAt: 1 }],
      }],
    );

    expect(assets[0].aliases).toEqual(['s', 'blob:preview', 'file://smile.png']);
  });
});
