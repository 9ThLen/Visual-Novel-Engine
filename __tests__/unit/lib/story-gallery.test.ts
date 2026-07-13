import { buildStoryGallery } from '@/lib/story-gallery';
import type { SceneRecord } from '@/lib/engine/types';

const image = { id: 'bg', type: 'image' as const, uri: 'file://bg', name: 'Room', addedAt: 1 };
const character = { id: 'c', name: 'Alice', color: '#fff', createdAt: 1, sprites: [{ id: 'happy', name: 'Happy', uri: 'file://happy', createdAt: 1 }] };
const scene = { id: 's', name: 'Scene', timeline: [
  { id: 'b1', blockType: 'background', enabled: true, data: { assetId: 'file://bg' } },
  { id: 'b2', blockType: 'background', enabled: false, data: { assetId: 'bg' } },
  { id: 'c1', blockType: 'character', enabled: true, data: { characterId: 'c', spriteId: 'happy' } },
] } as SceneRecord;

describe('buildStoryGallery', () => {
  it('groups sprites and separates enabled from disabled usage', () => {
    const gallery = buildStoryGallery([image], [character], [scene]);
    expect(gallery.backgrounds[0].usage).toEqual({ enabled: 1, disabled: 1 });
    expect(gallery.characters[0].character.name).toBe('Alice');
    expect(gallery.characters[0].sprites[0].usage).toEqual({ enabled: 1, disabled: 0 });
  });
  it('handles empty inputs', () => expect(buildStoryGallery([], [], [])).toEqual({ backgrounds: [], characters: [] }));
  it('handles stories without characters', () => expect(buildStoryGallery([image], [], []).characters).toEqual([]));
});
