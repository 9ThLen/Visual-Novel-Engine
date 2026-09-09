import { setMediaBlobStorageAdapterForTests } from '@/lib/idb-storage';
import type { LibraryAsset } from '@/lib/media-library-service';
import { migrateWebMediaReferences } from '@/lib/web-media-migration';
import type { Character } from '@/lib/character-types';

const has = vi.fn<() => Promise<boolean>>();
const put = vi.fn<() => Promise<void>>();

describe('web media migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    has.mockResolvedValue(false);
    put.mockResolvedValue(undefined);
    setMediaBlobStorageAdapterForTests({ has, put });
  });

  afterAll(() => {
    setMediaBlobStorageAdapterForTests(null);
  });

  it('moves library assets and character sprites to stable IDB references', async () => {
    const mediaLibrary: LibraryAsset[] = [{
      id: 'asset-1',
      type: 'image',
      uri: 'data:image/png;base64,QUJD',
      name: 'Background',
      addedAt: 1,
    }];
    const characterLibraries: Record<string, Character[]> = {
      'story-1': [{
        id: 'character-1',
        name: 'Alice',
        createdAt: 1,
        sprites: [{
          id: 'sprite-1',
          name: 'Default',
          uri: 'data:image/png;base64,REVG',
          createdAt: 1,
        }],
      }],
    };

    const migrated = await migrateWebMediaReferences(mediaLibrary, characterLibraries);

    expect(migrated.migratedCount).toBe(2);
    expect(migrated.mediaLibrary[0]).toMatchObject({
      id: 'asset-1',
      uri: expect.stringMatching(/^idb:\/\/media\/[a-f0-9]+$/),
    });
    expect(migrated.characterLibraries['story-1'][0].sprites[0]).toMatchObject({
      id: 'sprite-1',
      uri: expect.stringMatching(/^idb:\/\/media\/[a-f0-9]+$/),
    });
    expect(put).toHaveBeenCalledTimes(2);
    expect(mediaLibrary[0].uri).toContain('data:');
    expect(characterLibraries['story-1'][0].sprites[0].uri).toContain('data:');
  });

  it('leaves existing stable references unchanged', async () => {
    const asset: LibraryAsset = {
      id: 'asset-1',
      type: 'audio',
      uri: 'idb://media/asset-1',
      name: 'Music',
      addedAt: 1,
    };

    const migrated = await migrateWebMediaReferences([asset], {});

    expect(migrated).toMatchObject({ migratedCount: 0, mediaLibrary: [asset] });
    expect(has).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects without mutating source state when a Blob write fails', async () => {
    put.mockRejectedValueOnce(new Error('quota exceeded'));
    const asset: LibraryAsset = {
      id: 'asset-1',
      type: 'image',
      uri: 'data:image/png;base64,QUJD',
      name: 'Background',
      addedAt: 1,
    };

    await expect(migrateWebMediaReferences([asset], {})).rejects.toThrow('quota exceeded');
    expect(asset.uri).toContain('data:');
  });
});
