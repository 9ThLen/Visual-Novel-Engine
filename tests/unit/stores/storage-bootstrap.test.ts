import {
  getPersistableMediaLibrary,
  setWebMediaReferenceInvariant,
} from '@/lib/app-store-persistence';
import { setMediaBlobStorageAdapterForTests } from '@/lib/idb-storage';
import type { LibraryAsset } from '@/lib/media-library-service';
import { ensureStorageBootstrap, resetStorageBootstrapForTests } from '@/stores/storage-bootstrap';
import { useAppStore } from '@/stores/use-app-store';

// react-native (Platform.OS === 'web') and @/stores/use-app-store come from the
// vitest.config alias map; only the IndexedDB adapter is faked here, so the
// migration and the persistence gate run for real.
const has = vi.fn<() => Promise<boolean>>();
const put = vi.fn<() => Promise<void>>();

function makeInlineAsset(): LibraryAsset {
  return {
    id: 'asset-1',
    type: 'image',
    uri: 'data:image/png;base64,QUJD',
    name: 'Background',
    addedAt: 1,
  };
}

describe('storage bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorageBootstrapForTests();
    setWebMediaReferenceInvariant(false);
    has.mockResolvedValue(false);
    put.mockResolvedValue(undefined);
    setMediaBlobStorageAdapterForTests({ has, put });

    const state = useAppStore.getState();
    state.mediaLibrary = [makeInlineAsset()];
    state.characterLibraries = {};
  });

  afterAll(() => {
    setMediaBlobStorageAdapterForTests(null);
    setWebMediaReferenceInvariant(false);
  });

  it('migrates once and opens the gate no matter how many routes request it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const [first, second, third] = await Promise.all([
      ensureStorageBootstrap(),
      ensureStorageBootstrap(),
      ensureStorageBootstrap(),
    ]);

    // One shared run: the Blob is written exactly once, not once per caller.
    expect(put).toHaveBeenCalledTimes(1);
    expect(first.error).toBeNull();
    expect(second).toBe(first);
    expect(third).toBe(first);

    // The migrated reference is committed to the store...
    expect(useAppStore.getState().mediaLibrary[0].uri).toMatch(/^idb:\/\/media\//);

    // ...and the gate is open, so inline media can no longer be persisted.
    expect(getPersistableMediaLibrary([makeInlineAsset()])).toEqual([]);
    warn.mockRestore();
  });

  it('keeps the lossy size caps active when the media migration fails', async () => {
    const failure = new Error('quota exceeded');
    put.mockRejectedValue(failure);

    const result = await ensureStorageBootstrap();

    expect(result.error).toBe(failure);
    // Source state is untouched, so a retry can still find the inline media.
    expect(useAppStore.getState().mediaLibrary[0].uri).toContain('data:');
    // Gate stayed shut: the pre-migration cap behaviour is the rollback guard.
    expect(getPersistableMediaLibrary([makeInlineAsset()])).toHaveLength(1);
  });
});
