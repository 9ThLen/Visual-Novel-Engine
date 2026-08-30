/**
 * Exporting a playable folder from inside the app.
 *
 * The assembly is checked against a real zip: a fake shell goes in, and what
 * comes out is unzipped and inspected. Asserting on the produced bundle rather
 * than on calls is the point — the thing an author hands to a stranger is a
 * folder, and every mistake worth catching here is a mistake about its contents.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

import { collectReleaseObjects } from '@/lib/release/asset-sources';
import {
  buildPlayerBundle,
  PlayerShellUnavailableError,
} from '@/lib/release/shell-build';
import { readInlinedPlayerConfig } from '@/lib/release/player-bundle';
import { saveRelease } from '@/lib/release/release-storage';
import {
  checkPlayerShell,
  parsePlayerShellDescriptor,
  type PlayerShellDescriptor,
} from '@/lib/release/shell';
import {
  MIN_ENGINE_VERSION_FOR_RELEASE_V1,
  RELEASE_CONTAINER_VERSION,
  RELEASE_FORMAT,
  RELEASE_SCHEMA_VERSION,
  type ReleaseManifestV1,
  type ReleasePayloadV1,
} from '@/lib/release/types';
import type { StorageLike } from '@/lib/persistent-storage';
import type { SceneRecord } from '@/lib/engine/types';

const COVER_BYTES = strToU8('pretend this is a png');
// sha256 of COVER_BYTES, filled in by the fixture builder.
let coverHash = '';

const SHELL_HTML = '<html><head><title>Player</title></head><body><div id="root"></div></body></html>';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  } as StorageLike;
}

function shellZip(files: Record<string, string> = {}): Uint8Array {
  return zipSync({
    'index.html': strToU8(SHELL_HTML),
    '404.html': strToU8(SHELL_HTML),
    '_expo/static/js/web/entry-abc.js': strToU8('console.log("player")'),
    ...Object.fromEntries(Object.entries(files).map(([name, body]) => [name, strToU8(body)])),
  });
}

function shellDescriptor(version: string): PlayerShellDescriptor {
  return {
    version,
    file: `player-shell-${version}.zip`,
    bytes: 1,
    sha256: 'a'.repeat(64),
    entries: 3,
  };
}

function scene(id: string): SceneRecord {
  return {
    id,
    storyId: 'story_1',
    name: id,
    description: '',
    tags: [],
    timeline: [],
    sceneState: {
      backgroundAssetId: 'idb-media://cover',
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      musicTrackId: null,
      musicPlaying: false,
      musicVolume: 1,
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

async function storedRelease(storage: StorageLike): Promise<ReleaseManifestV1> {
  const { sha256Chunks, sourceFromBytes } = await import('@/lib/story-backup/hash');
  const payload: ReleasePayloadV1 = {
    scenes: { scene_1: scene('scene_1') },
    characters: [],
    audioLibrary: [],
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadDigest = await sha256Chunks(sourceFromBytes(payloadBytes).open());
  const coverDigest = await sha256Chunks(sourceFromBytes(COVER_BYTES).open());
  coverHash = coverDigest.sha256;

  const releasedAt = '2026-08-29T10:00:00.000Z';
  const manifest: ReleaseManifestV1 = {
    format: RELEASE_FORMAT,
    containerVersion: RELEASE_CONTAINER_VERSION,
    schemaVersion: RELEASE_SCHEMA_VERSION,
    createdAt: releasedAt,
    appVersion: '1.0.0',
    story: {
      id: 'story_1',
      title: 'A Test Novel',
      startSceneId: 'scene_1',
      createdAt: 1,
      updatedAt: 2,
      sceneCount: 1,
    },
    release: {
      releaseId: 'release_1',
      storyId: 'story_1',
      version: '1.2.0',
      channel: 'both',
      releasedAt,
      engineVersion: '1.0.0',
      minEngineVersion: MIN_ENGINE_VERSION_FOR_RELEASE_V1,
      payloadHash: payloadDigest.sha256,
      publication: { author: 'A Writer', languages: ['en'], contentRating: 'everyone' },
      stats: { scenes: 1, words: 0, readMinutes: 1, endings: 1, branches: 0 },
      showcase: { teaser: null, bannerBackgroundAssetId: 'idb-media://cover', terminalSceneIds: ['scene_1'] },
    },
    counts: {
      scenes: 1,
      characters: 0,
      audioItems: 0,
      embeddedAssets: 1,
      totalAssetBytes: coverDigest.size,
    },
    payload: { archivePath: 'story.json', sha256: payloadDigest.sha256, size: payloadDigest.size },
    assets: [{
      assetId: 'asset_cover',
      sourceReferences: ['asset_cover', 'idb-media://cover'],
      sha256: coverDigest.sha256,
      size: coverDigest.size,
      kind: 'image',
      mimeType: 'image/png',
      originalName: 'cover.png',
      originalExtension: '.png',
      archivePath: `objects/${coverDigest.sha256}`,
    }],
  };

  await saveRelease(storage, { manifest, payload, published: true });
  return manifest;
}

/**
 * The media library, standing in for the author's device. `collectReleaseObjects`
 * resolves each reference through this, which is the only way a stored release
 * gets its bytes back.
 */
const resolveSource = async (reference: string) => {
  if (reference !== 'asset_cover' && reference !== 'idb-media://cover') {
    throw new Error(`no such media: ${reference}`);
  }
  return {
    source: { async *open() { yield COVER_BYTES; } },
    mimeType: 'image/png',
    size: COVER_BYTES.byteLength,
  };
};

describe('exporting a playable folder', () => {
  it('writes the story into the shell and the media beside it', async () => {
    const storage = memoryStorage();
    await storedRelease(storage);

    const bundle = await buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_1',
      engineVersion: '1.0.0',
      storage,
      resolveSource,
      loadShell: async () => ({ descriptor: shellDescriptor('1.0.0'), bytes: shellZip() }),
    });

    const files = unzipSync(bundle.bytes);
    const names = Object.keys(files).sort();
    expect(names).toContain('index.html');
    expect(names).toContain('404.html');
    expect(names).toContain('_expo/static/js/web/entry-abc.js');
    expect(names).toContain(`media/${coverHash}.png`);
    expect(Array.from(files[`media/${coverHash}.png`])).toEqual(Array.from(COVER_BYTES));

    const config = readInlinedPlayerConfig(strFromU8(files['index.html']));
    expect((config?.story as { id?: string })?.id).toBe('story_1');
    expect(config?.assets?.['idb-media://cover']).toBe(`media/${coverHash}.png`);
    expect(config?.release).toMatchObject({ releaseId: 'release_1', version: '1.2.0' });
    expect(bundle.mediaFiles).toBe(1);
  });

  /**
   * Hosts with no SPA rewrite answer a deep link with `404.html`. A copy of it
   * without the story would open on an empty screen for anyone who followed a
   * link into the middle of the bundle.
   */
  it('writes the story into every HTML entry point, not only index', async () => {
    const storage = memoryStorage();
    await storedRelease(storage);

    const bundle = await buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_1',
      engineVersion: '1.0.0',
      storage,
      resolveSource,
      loadShell: async () => ({ descriptor: shellDescriptor('1.0.0'), bytes: shellZip() }),
    });

    const files = unzipSync(bundle.bytes);
    expect(readInlinedPlayerConfig(strFromU8(files['404.html']))).not.toBeNull();
  });

  it('names the file after the story and the version', async () => {
    const storage = memoryStorage();
    await storedRelease(storage);

    const bundle = await buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_1',
      engineVersion: '1.0.0',
      storage,
      resolveSource,
      loadShell: async () => ({ descriptor: shellDescriptor('1.0.0'), bytes: shellZip() }),
    });

    expect(bundle.fileName).toBe('A_Test_Novel-v1.2.0.zip');
  });

  it('reports each step so a long export is not a frozen screen', async () => {
    const storage = memoryStorage();
    await storedRelease(storage);
    const seen: string[] = [];

    await buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_1',
      engineVersion: '1.0.0',
      storage,
      onProgress: (progress) => seen.push(progress),
      resolveSource,
      loadShell: async () => ({ descriptor: shellDescriptor('1.0.0'), bytes: shellZip() }),
    });

    expect(seen).toEqual(['preparing', 'downloading', 'collecting', 'assembling', 'saving']);
  });

  /**
   * A shell from another build carries another reader. Exporting into it would
   * hand a stranger a novel played by code that never saw this release's schema,
   * and nobody would find out until they opened it.
   */
  it('refuses a shell built by a different engine version', async () => {
    const storage = memoryStorage();
    await storedRelease(storage);

    await expect(buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_1',
      engineVersion: '1.1.0',
      storage,
      resolveSource,
      loadShell: async () => ({ descriptor: shellDescriptor('1.0.0'), bytes: shellZip() }),
    })).rejects.toThrow(PlayerShellUnavailableError);
  });

  it('refuses when the deployment ships no shell at all', async () => {
    const storage = memoryStorage();
    await storedRelease(storage);

    const failure = await buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_1',
      engineVersion: '1.0.0',
      storage,
      loadShell: async () => null,
    }).catch((error) => error);

    expect(failure).toBeInstanceOf(PlayerShellUnavailableError);
    expect((failure as PlayerShellUnavailableError).problem.kind).toBe('missing');
  });

  // Checked before any media is collected: an author on a broken deployment
  // should not wait through the slow part to be told no.
  it('checks the shell before collecting anything', async () => {
    const storage = memoryStorage();
    await storedRelease(storage);
    const seen: string[] = [];

    await buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_1',
      engineVersion: '9.9.9',
      storage,
      onProgress: (progress) => seen.push(progress),
      resolveSource,
      loadShell: async () => ({ descriptor: shellDescriptor('1.0.0'), bytes: shellZip() }),
    }).catch(() => undefined);

    expect(seen).not.toContain('collecting');
  });

  it('refuses a shell with no page to write the story into', async () => {
    const storage = memoryStorage();
    await storedRelease(storage);

    await expect(buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_1',
      engineVersion: '1.0.0',
      storage,
      resolveSource,
      loadShell: async () => ({
        descriptor: shellDescriptor('1.0.0'),
        bytes: zipSync({ 'readme.txt': strToU8('nothing to see') }),
      }),
    })).rejects.toThrow('no index.html');
  });

  it('refuses a release that is no longer stored', async () => {
    await expect(buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_gone',
      engineVersion: '1.0.0',
      storage: memoryStorage(),
      resolveSource,
      loadShell: async () => ({ descriptor: shellDescriptor('1.0.0'), bytes: shellZip() }),
    })).rejects.toThrow('no longer stored');
  });
  /**
   * The shell carries no `assets/` directory, so a bundled reference the release
   * failed to package would become a blank picture in a stranger's copy — the
   * kind of defect the author never sees.
   */
  it('refuses a release that refers to a bundled file it did not package', async () => {
    const storage = memoryStorage();
    const manifest = await storedRelease(storage);
    const withDanglingReference: ReleasePayloadV1 = {
      scenes: {
        scene_1: {
          ...scene('scene_1'),
          sceneState: { ...scene('scene_1').sceneState, backgroundAssetId: 'assets/background/bg-x.png' },
        },
      },
      characters: [],
      audioLibrary: [],
    };
    await saveRelease(storage, {
      manifest: { ...manifest, release: { ...manifest.release, releaseId: 'release_2' } },
      payload: withDanglingReference,
    });

    await expect(buildPlayerBundle({
      storyId: 'story_1',
      releaseId: 'release_2',
      engineVersion: '1.0.0',
      storage,
      resolveSource,
      loadShell: async () => ({ descriptor: shellDescriptor('1.0.0'), bytes: shellZip() }),
    })).rejects.toThrow('assets/background/bg-x.png');
  });
});

describe('the player shell descriptor', () => {
  it('accepts what the build writes', () => {
    expect(parsePlayerShellDescriptor({
      version: '1.0.0',
      file: 'player-shell-1.0.0.zip',
      bytes: 1234,
      sha256: 'b'.repeat(64),
      entries: 42,
      builtAt: '2026-08-30T00:00:00.000Z',
    })).toMatchObject({ version: '1.0.0', entries: 42 });
  });

  /**
   * The descriptor names a sibling of index.html. Anything with a path in it
   * would let a deployment — or whatever answered that request — point the
   * studio somewhere it was never meant to look.
   */
  it('refuses a file field that is not a plain filename', () => {
    for (const file of ['../secret.zip', 'nested/shell.zip', 'a\\b.zip']) {
      expect(parsePlayerShellDescriptor({
        version: '1.0.0',
        file,
        bytes: 1,
        sha256: 'b'.repeat(64),
      }), file).toBeNull();
    }
  });

  it('refuses a descriptor missing the facts it exists to carry', () => {
    expect(parsePlayerShellDescriptor({ file: 'x.zip', bytes: 1, sha256: 'b'.repeat(64) })).toBeNull();
    expect(parsePlayerShellDescriptor({ version: '1.0.0', file: 'x.zip', bytes: 0, sha256: 'b'.repeat(64) })).toBeNull();
    expect(parsePlayerShellDescriptor({ version: '1.0.0', file: 'x.zip', bytes: 1, sha256: 'nope' })).toBeNull();
    expect(parsePlayerShellDescriptor(null)).toBeNull();
  });

  it('names the mismatch rather than just refusing', () => {
    expect(checkPlayerShell(shellDescriptor('1.0.0'), '1.1.0')).toEqual({
      kind: 'version-mismatch',
      shellVersion: '1.0.0',
      engineVersion: '1.1.0',
    });
    expect(checkPlayerShell(null, '1.0.0')).toEqual({ kind: 'missing' });
    expect(checkPlayerShell(shellDescriptor('1.0.0'), '1.0.0')).toBeNull();
  });
});

describe('getting a stored release’s media back', () => {
  /**
   * The bytes live in the media library, not in the release, so exporting has to
   * find them again — and prove they are the same ones. An author who replaced a
   * picture after publishing would otherwise ship a bundle that does not match
   * the manifest it claims to be.
   */
  it('refuses when a file has changed since the release was published', async () => {
    const storage = memoryStorage();
    const manifest = await storedRelease(storage);

    await expect(collectReleaseObjects(manifest, {
      resolveSource: async () => ({
        source: { async *open() { yield strToU8('different bytes entirely'); } },
        mimeType: 'image/png',
        size: 24,
      }),
    })).rejects.toThrow('has changed since this release was published');
  });

  it('names the file when it is gone, and every name it tried', async () => {
    const storage = memoryStorage();
    const manifest = await storedRelease(storage);

    const failure = await collectReleaseObjects(manifest, {
      resolveSource: async (reference) => { throw new Error(`gone: ${reference}`); },
    }).catch((error: Error) => error.message);

    expect(failure).toContain('cover.png');
    expect(failure).toContain('gone: asset_cover');
    expect(failure).toContain('gone: idb-media://cover');
  });

  // A library entry renamed by a migration should not cost an author their
  // export when another recorded name still works.
  it('falls back to another recorded reference', async () => {
    const storage = memoryStorage();
    const manifest = await storedRelease(storage);

    const objects = await collectReleaseObjects(manifest, {
      resolveSource: async (reference) => {
        if (reference === 'asset_cover') throw new Error('renamed away');
        return { source: { async *open() { yield COVER_BYTES; } }, mimeType: 'image/png', size: 1 };
      },
    });

    expect(objects.size).toBe(1);
  });

  it('reads one file once however many scenes point at it', async () => {
    const storage = memoryStorage();
    const manifest = await storedRelease(storage);
    const twice: ReleaseManifestV1 = {
      ...manifest,
      assets: [
        manifest.assets[0],
        { ...manifest.assets[0], assetId: 'asset_cover_again', sourceReferences: ['idb-media://cover'] },
      ],
    };
    let reads = 0;

    const objects = await collectReleaseObjects(twice, {
      resolveSource: async () => {
        reads += 1;
        return { source: { async *open() { yield COVER_BYTES; } }, mimeType: 'image/png', size: 1 };
      },
    });

    expect(reads).toBe(1);
    expect(objects.size).toBe(1);
  });
});
