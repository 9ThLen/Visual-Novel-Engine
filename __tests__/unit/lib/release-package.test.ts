/**
 * The `.vnerelease` container: written, read back, and unpacked.
 *
 * The interesting property is that this is the *same* zip machinery the backup
 * container uses (`lib/story-backup/archive.ts` and `extract.ts`), so these
 * cases are really asking whether the shared code still tells the truth when the
 * manifest inside it is a release rather than a backup.
 */
import {
  extractReleaseArchive,
  previewReleaseArchive,
  readReleaseManifest,
  readReleasePayload,
  writeReleaseArchive,
} from '@/lib/release/package';
import { writeStoryArchive } from '@/lib/story-backup/archive';
import { sha256Chunks, sourceFromBytes } from '@/lib/story-backup/hash';
import type {
  PreparedStoryBackupAsset,
  StoryArchiveBinarySink,
  StoryArchiveBinarySource,
} from '@/lib/story-backup/types';
import {
  MIN_ENGINE_VERSION_FOR_RELEASE_V1,
  RELEASE_CONTAINER_VERSION,
  RELEASE_FORMAT,
  RELEASE_SCHEMA_VERSION,
  type ReleaseManifestV1,
  type ReleasePayloadV1,
} from '@/lib/release/types';
import type { SceneRecord } from '@/lib/engine/types';

function collectingSink(): { sink: StoryArchiveBinarySink; bytes: () => Uint8Array } {
  const chunks: Uint8Array[] = [];
  let closed = false;
  return {
    sink: {
      async write(chunk) { chunks.push(chunk.slice()); },
      async close() { closed = true; },
      async abort() { chunks.length = 0; },
    },
    bytes() {
      if (!closed) throw new Error('sink was never closed');
      const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
      return out;
    },
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
    isStart: id === 'scene_1',
    createdAt: 1,
    updatedAt: 1,
  };
}

const COVER_BYTES = new TextEncoder().encode('not really a png, but stable bytes');

async function buildFixture(): Promise<{
  manifest: ReleaseManifestV1;
  payload: ReleasePayloadV1;
  payloadBytes: Uint8Array;
  assets: PreparedStoryBackupAsset[];
}> {
  const payload: ReleasePayloadV1 = {
    scenes: { scene_1: scene('scene_1') },
    characters: [],
    audioLibrary: [],
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadDigest = await sha256Chunks(sourceFromBytes(payloadBytes).open());
  const coverDigest = await sha256Chunks(sourceFromBytes(COVER_BYTES).open());

  const assets: PreparedStoryBackupAsset[] = [{
    metadata: {
      assetId: 'asset_cover',
      sourceReferences: ['asset_cover', 'idb-media://cover'],
      sha256: coverDigest.sha256,
      size: coverDigest.size,
      kind: 'image',
      mimeType: 'image/png',
      originalName: 'cover.png',
      originalExtension: '.png',
      archivePath: `objects/${coverDigest.sha256}`,
    },
    source: sourceFromBytes(COVER_BYTES),
  }];

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
      version: '1.0.0',
      channel: 'both',
      releasedAt,
      engineVersion: '1.0.0',
      minEngineVersion: MIN_ENGINE_VERSION_FOR_RELEASE_V1,
      payloadHash: payloadDigest.sha256,
      publication: { author: 'A Writer', languages: ['en'], contentRating: 'everyone' },
      stats: { scenes: 1, words: 0, readMinutes: 1, endings: 1, branches: 0 },
      showcase: {
        teaser: null,
        bannerBackgroundAssetId: 'idb-media://cover',
        terminalSceneIds: ['scene_1'],
      },
    },
    counts: {
      scenes: 1,
      characters: 0,
      audioItems: 0,
      embeddedAssets: 1,
      totalAssetBytes: coverDigest.size,
    },
    payload: { archivePath: 'story.json', sha256: payloadDigest.sha256, size: payloadDigest.size },
    assets: assets.map((asset) => asset.metadata),
  };

  return { manifest, payload, payloadBytes, assets };
}

async function writeFixture(): Promise<{ source: StoryArchiveBinarySource; manifest: ReleaseManifestV1 }> {
  const fixture = await buildFixture();
  const { sink, bytes } = collectingSink();
  const manifest = await writeReleaseArchive(fixture, sink);
  const archive = bytes();
  return { source: { size: archive.byteLength, ...sourceFromBytes(archive) }, manifest };
}

describe('the release container', () => {
  it('round-trips a release through the shared zip machinery', async () => {
    const { source, manifest } = await writeFixture();

    const read = await readReleaseManifest(source);
    expect(read.format).toBe(RELEASE_FORMAT);
    expect(read.release.releaseId).toBe('release_1');
    expect(read).toEqual(manifest);

    const payload = await readReleasePayload(source, read);
    expect(Object.keys(payload.scenes)).toEqual(['scene_1']);
  });

  // The manifest is the first entry precisely so this costs one entry, which is
  // what makes listing a folder of releases cheap.
  it('previews without reading the payload or the objects', async () => {
    const { source, manifest } = await writeFixture();
    const preview = await previewReleaseArchive(source);

    expect(preview.story.title).toBe('A Test Novel');
    expect(preview.release.version).toBe('1.0.0');
    // Payload plus media: what the whole artifact weighs, which is the number
    // a "this is a heavy download" warning has to be based on.
    expect(preview.totalBytes).toBe(manifest.payload.size + COVER_BYTES.byteLength);
  });

  it('unpacks the packaged objects, verified against the manifest', async () => {
    const { source, manifest } = await writeFixture();
    const written = new Map<string, Uint8Array>();

    const { payload, objects } = await extractReleaseArchive(source, manifest, (asset) => {
      const chunks: Uint8Array[] = [];
      return {
        async write(chunk: Uint8Array) { chunks.push(chunk.slice()); },
        async close() {
          const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
          const out = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
          written.set(asset.assetId, out);
          return asset.assetId;
        },
        async abort() { chunks.length = 0; },
      };
    });

    expect(objects.size).toBe(1);
    expect(payload.scenes.scene_1.sceneState.backgroundAssetId).toBe('idb-media://cover');
    expect(Array.from(written.get('asset_cover') ?? [])).toEqual(Array.from(COVER_BYTES));
  });

  /**
   * A release and a backup are the same zip, so the format field is the only
   * thing standing between "this is a release" and quietly playing an author's
   * private working copy.
   */
  it('refuses a story backup, and says which artifact it wanted', async () => {
    const { sink, bytes } = collectingSink();
    await writeStoryArchive(
      {
        story: {
          id: 'story_1',
          title: 'A Test Novel',
          startSceneId: 'scene_1',
          createdAt: 1,
          updatedAt: 2,
          sceneCount: 1,
        },
        payload: {
          scenes: { scene_1: scene('scene_1') },
          characters: [],
          audioLibrary: [],
          mediaMembershipIds: [],
        },
        assets: [],
        appVersion: '1.0.0',
      },
      sink,
    );
    const archive = bytes();

    await expect(readReleaseManifest(sourceFromBytes(archive)))
      .rejects.toThrow('this file declares itself "vne-story-backup"');
  });

  it('rejects bytes that are not an archive at all, naming the release', async () => {
    const garbage = new TextEncoder().encode('this is not a zip file');
    await expect(readReleaseManifest(sourceFromBytes(garbage))).rejects.toThrow('Not a VNE release');
  });

  // The manifest's digest is what a reader trusts; a writer that could disagree
  // with it would produce a file that fails only on the reader's machine.
  it('refuses to write a payload the manifest does not describe', async () => {
    const fixture = await buildFixture();
    const { sink } = collectingSink();

    await expect(
      writeReleaseArchive(
        { ...fixture, payloadBytes: new TextEncoder().encode('{}') },
        sink,
      ),
    ).rejects.toThrow('does not match the size its manifest declares');
  });

  it('refuses an object whose bytes changed since the manifest was built', async () => {
    const fixture = await buildFixture();
    const { sink } = collectingSink();

    await expect(
      writeReleaseArchive(
        {
          ...fixture,
          assets: [{
            ...fixture.assets[0],
            source: sourceFromBytes(new TextEncoder().encode('different bytes entirely')),
          }],
        },
        sink,
      ),
    ).rejects.toThrow('changed while archiving');
  });
});
