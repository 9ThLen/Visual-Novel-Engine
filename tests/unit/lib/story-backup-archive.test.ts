import {
  unzipSync,
  Zip,
  ZipPassThrough,
  zipSync,
} from 'fflate';

import {
  previewStoryArchive,
  readStoryArchiveManifest,
  readStoryArchivePayload,
  writeStoryArchive,
} from '@/lib/story-backup/archive';
import {
  sha256Chunks,
  sourceFromBytes,
  sourceFromReadableStream,
} from '@/lib/story-backup/hash';
import { extractStoryArchive, type StoryArchiveObjectSink } from '@/lib/story-backup/extract';
import { parseStoryArchiveManifest } from '@/lib/story-backup/manifest';
import {
  STORY_BACKUP_LIMITS,
  type StoryArchiveBinarySink,
  type StoryArchiveManifestV1,
  type StoryArchivePayloadV1,
  type StoryBackupAsset,
} from '@/lib/story-backup/types';
import type { StoryMetadata } from '@/lib/story-domain';

class MemorySink implements StoryArchiveBinarySink {
  readonly chunks: Uint8Array[] = [];
  closed = false;

  async write(chunk: Uint8Array): Promise<void> {
    this.chunks.push(chunk.slice());
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async abort(): Promise<void> {
    this.chunks.length = 0;
  }

  bytes(): Uint8Array {
    const size = this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}

class MemoryObjectSink implements StoryArchiveObjectSink<Uint8Array> {
  private readonly chunks: Uint8Array[] = [];

  async write(chunk: Uint8Array): Promise<void> {
    this.chunks.push(chunk.slice());
  }

  async close(): Promise<Uint8Array> {
    const size = this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    this.chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return result;
  }

  async abort(): Promise<void> {
    this.chunks.length = 0;
  }
}

const story: StoryMetadata = {
  id: 'story-1',
  title: 'Portable story',
  author: 'Author',
  startSceneId: 'scene-1',
  createdAt: 1,
  updatedAt: 2,
  sceneCount: 1,
};

const payload: StoryArchivePayloadV1 = {
  scenes: {
    'scene-1': {
      id: 'scene-1',
      storyId: story.id,
      name: 'Scene',
      description: '',
      tags: [],
      timeline: [],
      sceneState: {
        backgroundAssetId: null,
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
    },
  },
  characters: [],
  audioLibrary: [],
  mediaMembershipIds: ['asset-1', 'asset-2'],
};

function withExplicitTimeout<T>(promise: Promise<T>, timeoutMs = 1_000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Story backup reader did not settle within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

function zipOrderedEntries(entries: {
  name: string;
  bytes: Uint8Array;
}[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else if (chunk.byteLength) chunks.push(chunk.slice());
  });
  for (const entry of entries) {
    const file = new ZipPassThrough(entry.name);
    zip.add(file);
    file.push(entry.bytes, true);
  }
  zip.end();
  if (failure) throw failure;
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function makeSingleAssetArchive() {
  const objectBytes = new Uint8Array([1, 2, 3, 4]);
  const digest = await sha256Chunks(sourceFromBytes(objectBytes).open());
  const sink = new MemorySink();
  const manifest = await writeStoryArchive({
    story,
    payload: { ...payload, mediaMembershipIds: ['asset-1'] },
    assets: [{
      metadata: {
        assetId: 'asset-1',
        sourceReferences: ['asset-1'],
        sha256: digest.sha256,
        size: digest.size,
        kind: 'other',
        mimeType: 'application/octet-stream',
        originalName: 'asset.bin',
        archivePath: `objects/${digest.sha256}`,
      },
      source: sourceFromBytes(objectBytes),
    }],
    appVersion: '1.0.0',
  }, sink);
  return {
    entries: unzipSync(sink.bytes()),
    manifest,
    objectBytes,
    objectPath: `objects/${digest.sha256}`,
  };
}

describe('story backup streaming primitives', () => {
  it('calculates SHA-256 incrementally across chunks', async () => {
    const result = await sha256Chunks(sourceFromBytes(new TextEncoder().encode('abc'), 1).open());
    expect(result).toEqual({
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      size: 3,
    });
  });

  it('cancels a readable stream when a consumer stops before EOF', async () => {
    const cancel = vi.fn();
    const source = sourceFromReadableStream(() => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    }));
    const iterator = source.open()[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await iterator.return?.();

    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects garbage and empty ZIP inputs instead of leaving preview pending', async () => {
    const invalidInputs = [
      new Uint8Array([1, 2, 3, 4]),
      zipSync({}),
    ];

    for (const bytes of invalidInputs) {
      await expect(withExplicitTimeout(previewStoryArchive(sourceFromBytes(bytes))))
        .rejects.toThrow('Not a VNE story backup');
      await expect(withExplicitTimeout(readStoryArchivePayload(
        sourceFromBytes(bytes),
        {} as StoryArchiveManifestV1,
      ))).rejects.toThrow('Not a VNE story backup');
    }
  });

  it('rejects malformed manifest JSON', async () => {
    const hostileArchive = zipSync({
      'manifest.json': new TextEncoder().encode('{not-json'),
      'story.json': new TextEncoder().encode('{}'),
    });

    await expect(readStoryArchiveManifest(sourceFromBytes(hostileArchive)))
      .rejects.toThrow('Invalid story backup manifest JSON');
  });

  it('writes one content object for duplicate logical assets and roundtrips payload', async () => {
    const objectBytes = new Uint8Array([1, 2, 3, 4]);
    const digest = await sha256Chunks(sourceFromBytes(objectBytes, 2).open());
    const asset = (assetId: string): StoryBackupAsset => ({
      assetId,
      sourceReferences: [assetId, `idb://media/${assetId}`],
      sha256: digest.sha256,
      size: digest.size,
      kind: 'audio',
      mimeType: 'audio/flac',
      originalName: `${assetId}.flac`,
      originalExtension: '.flac',
      archivePath: `objects/${digest.sha256}`,
    });
    const sink = new MemorySink();

    const writtenManifest = await writeStoryArchive({
      story,
      payload,
      assets: [
        { metadata: asset('asset-1'), source: sourceFromBytes(objectBytes, 1) },
        { metadata: asset('asset-2'), source: sourceFromBytes(objectBytes, 3) },
      ],
      appVersion: '1.0.0',
      createdAt: new Date('2026-08-11T12:00:00.000Z'),
    }, sink);

    expect(sink.closed).toBe(true);
    const archiveBytes = sink.bytes();
    const entries = unzipSync(archiveBytes);
    expect(Object.keys(entries)).toEqual([
      'manifest.json',
      'story.json',
      `objects/${digest.sha256}`,
    ]);

    const source = sourceFromBytes(archiveBytes, 7);
    await expect(readStoryArchiveManifest(source)).resolves.toEqual(writtenManifest);
    await expect(readStoryArchivePayload(source, writtenManifest)).resolves.toEqual(payload);
    await expect(previewStoryArchive(source)).resolves.toMatchObject({
      story: { title: story.title },
      counts: { embeddedAssets: 2, totalAssetBytes: 8 },
      mediaKinds: { audio: 2 },
    });
    const extracted = await extractStoryArchive(
      source,
      writtenManifest,
      () => new MemoryObjectSink(),
    );
    expect(extracted.payload).toEqual(payload);
    expect(extracted.objects.get(digest.sha256)).toEqual(objectBytes);
  });

  it('aborts output when an object changes after capture', async () => {
    const expectedBytes = new Uint8Array([1, 2, 3]);
    const actualBytes = new Uint8Array([1, 2, 4]);
    const digest = await sha256Chunks(sourceFromBytes(expectedBytes).open());
    const sink = new MemorySink();

    await expect(writeStoryArchive({
      story,
      payload,
      assets: [{
        metadata: {
          assetId: 'asset-1',
          sourceReferences: ['asset-1'],
          sha256: digest.sha256,
          size: digest.size,
          kind: 'other',
          mimeType: 'application/octet-stream',
          originalName: 'asset.bin',
          archivePath: `objects/${digest.sha256}`,
        },
        source: sourceFromBytes(actualBytes),
      }],
      appVersion: '1.0.0',
    }, sink)).rejects.toThrow('changed while archiving');

    expect(sink.chunks).toHaveLength(0);
  });

  it('rejects archive path traversal before writing an object', async () => {
    const objectBytes = new Uint8Array([9]);
    const digest = await sha256Chunks(sourceFromBytes(objectBytes).open());
    const sink = new MemorySink();
    const manifest = await writeStoryArchive({
      story,
      payload: { ...payload, mediaMembershipIds: ['asset-1'] },
      assets: [{
        metadata: {
          assetId: 'asset-1',
          sourceReferences: ['asset-1'],
          sha256: digest.sha256,
          size: digest.size,
          kind: 'other',
          mimeType: 'application/octet-stream',
          originalName: 'asset.bin',
          archivePath: `objects/${digest.sha256}`,
        },
        source: sourceFromBytes(objectBytes),
      }],
      appVersion: '1.0.0',
    }, sink);
    const validEntries = unzipSync(sink.bytes());
    const hostileArchive = zipSync({
      'manifest.json': validEntries['manifest.json'],
      'story.json': validEntries['story.json'],
      '../escaped.bin': objectBytes,
    });
    const createSink = vi.fn(() => new MemoryObjectSink());

    await expect(extractStoryArchive(
      sourceFromBytes(hostileArchive),
      manifest,
      createSink,
    )).rejects.toThrow('Unsafe or unexpected');
    expect(createSink).not.toHaveBeenCalled();
  });

  it('rejects an object whose bytes do not match the manifest hash', async () => {
    const fixture = await makeSingleAssetArchive();
    const hostileArchive = zipSync({
      'manifest.json': fixture.entries['manifest.json'],
      'story.json': fixture.entries['story.json'],
      [fixture.objectPath]: new Uint8Array([4, 3, 2, 1]),
    });

    await expect(extractStoryArchive(
      sourceFromBytes(hostileArchive),
      fixture.manifest,
      () => new MemoryObjectSink(),
    )).rejects.toThrow('Story backup object hash mismatch');
  });

  it('rejects an archive with a missing content object', async () => {
    const fixture = await makeSingleAssetArchive();
    const hostileArchive = zipSync({
      'manifest.json': fixture.entries['manifest.json'],
      'story.json': fixture.entries['story.json'],
    });

    await expect(extractStoryArchive(
      sourceFromBytes(hostileArchive),
      fixture.manifest,
      () => new MemoryObjectSink(),
    )).rejects.toThrow(`Story backup is missing object: ${fixture.objectPath}`);
  });

  it('rejects an oversized archive entry', async () => {
    const oversizedManifest = new Uint8Array(STORY_BACKUP_LIMITS.maxManifestBytes + 1);
    const hostileArchive = zipOrderedEntries([{
      name: 'manifest.json',
      bytes: oversizedManifest,
    }]);

    await expect(readStoryArchiveManifest(sourceFromBytes(hostileArchive)))
      .rejects.toThrow('entry exceeds');
  });

  it('rejects a highly compressed entry', async () => {
    const fixture = await makeSingleAssetArchive();
    const paddedManifest = new Uint8Array(512 * 1024);
    paddedManifest.fill(32);
    paddedManifest.set(fixture.entries['manifest.json']);
    const hostileArchive = zipSync({
      'manifest.json': [paddedManifest, { level: 9 }],
      'story.json': fixture.entries['story.json'],
      [fixture.objectPath]: fixture.objectBytes,
    });

    await expect(extractStoryArchive(
      sourceFromBytes(hostileArchive),
      fixture.manifest,
      () => new MemoryObjectSink(),
    )).rejects.toThrow('unsafe compression ratio');
  });

  it('rejects duplicate ZIP entries', async () => {
    const fixture = await makeSingleAssetArchive();
    const hostileArchive = zipOrderedEntries([
      { name: 'manifest.json', bytes: fixture.entries['manifest.json'] },
      { name: 'story.json', bytes: fixture.entries['story.json'] },
      { name: fixture.objectPath, bytes: fixture.objectBytes },
      { name: fixture.objectPath, bytes: fixture.objectBytes },
    ]);

    await expect(extractStoryArchive(
      sourceFromBytes(hostileArchive),
      fixture.manifest,
      () => new MemoryObjectSink(),
    )).rejects.toThrow(`Duplicate story backup entry: ${fixture.objectPath}`);
  });

  it('rejects ZIP entries in the wrong order', async () => {
    const fixture = await makeSingleAssetArchive();
    const hostileArchive = zipOrderedEntries([
      { name: 'story.json', bytes: fixture.entries['story.json'] },
      { name: 'manifest.json', bytes: fixture.entries['manifest.json'] },
      { name: fixture.objectPath, bytes: fixture.objectBytes },
    ]);

    await expect(extractStoryArchive(
      sourceFromBytes(hostileArchive),
      fixture.manifest,
      () => new MemoryObjectSink(),
    )).rejects.toThrow('manifest must be the first entry');
  });

  it('rejects ambiguous media references in the manifest', async () => {
    const hashA = 'a'.repeat(64);
    const hashB = 'b'.repeat(64);
    const manifest = {
      format: 'vne-story-backup',
      containerVersion: 1,
      schemaVersion: 1,
      createdAt: '2026-08-11T12:00:00.000Z',
      appVersion: '1.0.0',
      story,
      counts: {
        scenes: 1,
        characters: 0,
        audioItems: 0,
        embeddedAssets: 2,
        totalAssetBytes: 2,
      },
      payload: { archivePath: 'story.json', sha256: hashA, size: 1 },
      assets: [
        {
          assetId: 'asset-1',
          sourceReferences: ['shared-uri'],
          sha256: hashA,
          size: 1,
          kind: 'image',
          mimeType: 'image/png',
          originalName: 'one.png',
          archivePath: `objects/${hashA}`,
        },
        {
          assetId: 'asset-2',
          sourceReferences: ['shared-uri'],
          sha256: hashB,
          size: 1,
          kind: 'audio',
          mimeType: 'audio/ogg',
          originalName: 'two.ogg',
          archivePath: `objects/${hashB}`,
        },
      ],
    };

    expect(() => parseStoryArchiveManifest(manifest)).toThrow('Ambiguous story backup media reference');
  });

  it('rejects duplicate content hashes with conflicting declared sizes', () => {
    const hash = 'a'.repeat(64);
    const manifest = {
      format: 'vne-story-backup',
      containerVersion: 1,
      schemaVersion: 1,
      createdAt: '2026-08-11T12:00:00.000Z',
      appVersion: '1.0.0',
      story,
      counts: {
        scenes: 1,
        characters: 0,
        audioItems: 0,
        embeddedAssets: 2,
        totalAssetBytes: 3,
      },
      payload: { archivePath: 'story.json', sha256: hash, size: 1 },
      assets: [
        {
          assetId: 'asset-1',
          sourceReferences: ['asset-1'],
          sha256: hash,
          size: 1,
          kind: 'image',
          mimeType: 'image/png',
          originalName: 'one.png',
          archivePath: `objects/${hash}`,
        },
        {
          assetId: 'asset-2',
          sourceReferences: ['asset-2'],
          sha256: hash,
          size: 2,
          kind: 'image',
          mimeType: 'image/png',
          originalName: 'two.png',
          archivePath: `objects/${hash}`,
        },
      ],
    };

    expect(() => parseStoryArchiveManifest(manifest))
      .toThrow('Inconsistent story backup object size');
  });
});
