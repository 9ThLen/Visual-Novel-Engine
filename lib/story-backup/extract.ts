import { Unzip, UnzipInflate, strFromU8, type UnzipFile } from 'fflate';
import { Hash } from 'fast-sha256';

import {
  parseStoryArchiveManifest,
  parseStoryArchivePayload,
} from '@/lib/story-backup/manifest';
import {
  STORY_BACKUP_LIMITS,
  STORY_BACKUP_PATHS,
  type StoryArchiveBinarySource,
  type StoryArchiveManifestV1,
  type StoryArchivePayloadV1,
  type StoryBackupAsset,
} from '@/lib/story-backup/types';

const EMPTY_BYTES = new Uint8Array();
const SAFE_ENTRY_PATTERN = /^(manifest\.json|story\.json|objects\/[a-f0-9]{64})$/;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function assertSafePath(path: string): void {
  if (!SAFE_ENTRY_PATTERN.test(path) || path.includes('\\') || path.includes('..')) {
    throw new Error(`Unsafe or unexpected story backup entry: ${path}`);
  }
}

export interface StoryArchiveObjectSink<TResult> {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<TResult>;
  abort(reason: unknown): Promise<void>;
}

export interface ExtractedStoryArchive<TResult> {
  payload: StoryArchivePayloadV1;
  objects: Map<string, TResult>;
}

export async function extractStoryArchive<TResult>(
  source: StoryArchiveBinarySource,
  expectedManifest: StoryArchiveManifestV1,
  createObjectSink: (
    asset: StoryBackupAsset,
  ) => Promise<StoryArchiveObjectSink<TResult>> | StoryArchiveObjectSink<TResult>,
  maxTotalBytes = STORY_BACKUP_LIMITS.maxNativeUncompressedBytes,
): Promise<ExtractedStoryArchive<TResult>> {
  const manifestChunks: Uint8Array[] = [];
  const payloadChunks: Uint8Array[] = [];
  const results = new Map<string, TResult>();
  const seenPaths = new Set<string>();
  const expectedObjects = new Map<string, StoryBackupAsset>();
  expectedManifest.assets.forEach((asset) => {
    if (!expectedObjects.has(asset.archivePath)) expectedObjects.set(asset.archivePath, asset);
  });
  const openedSinks = new Set<StoryArchiveObjectSink<TResult>>();
  let entryCount = 0;
  let totalBytes = 0;
  let manifestSize = 0;
  let payloadSize = 0;
  let payloadHasher: Hash | null = new Hash();
  let pending = Promise.resolve();
  let failure: unknown;

  const queue = (task: () => Promise<void> | void) => {
    pending = pending.then(task).catch((error) => {
      failure ??= error;
    });
  };
  const checkChunk = (chunk: Uint8Array, entrySize: number, maxEntryBytes: number) => {
    const nextEntrySize = entrySize + chunk.byteLength;
    totalBytes += chunk.byteLength;
    if (nextEntrySize > maxEntryBytes) throw new Error('Story backup entry exceeds its size limit');
    if (totalBytes > maxTotalBytes) throw new Error('Story backup exceeds its total size limit');
    return nextEntrySize;
  };
  const checkCompressionRatio = (file: UnzipFile, actualSize: number) => {
    if (typeof file.size === 'number' && file.size > 0
      && actualSize / file.size > STORY_BACKUP_LIMITS.maxCompressionRatio) {
      throw new Error(`Story backup entry has an unsafe compression ratio: ${file.name}`);
    }
  };

  const unzip = new Unzip((file: UnzipFile) => {
    if (failure !== undefined) return;
    try {
      entryCount += 1;
      if (entryCount > STORY_BACKUP_LIMITS.maxEntries) throw new Error('Story backup has too many entries');
      assertSafePath(file.name);
      if (seenPaths.has(file.name)) throw new Error(`Duplicate story backup entry: ${file.name}`);
      seenPaths.add(file.name);
      if (entryCount === 1 && file.name !== STORY_BACKUP_PATHS.manifest) {
        throw new Error('Story backup manifest must be the first entry');
      }
      if (entryCount === 2 && file.name !== STORY_BACKUP_PATHS.payload) {
        throw new Error('Story backup payload must be the second entry');
      }

      if (file.name === STORY_BACKUP_PATHS.manifest) {
        file.ondata = (error, chunk, final) => queue(() => {
          if (error) throw error;
          manifestSize = checkChunk(chunk, manifestSize, STORY_BACKUP_LIMITS.maxManifestBytes);
          if (chunk.byteLength) manifestChunks.push(chunk.slice());
          if (final) checkCompressionRatio(file, manifestSize);
        });
        file.start();
        return;
      }

      if (file.name === STORY_BACKUP_PATHS.payload) {
        file.ondata = (error, chunk, final) => queue(() => {
          if (error) throw error;
          payloadSize = checkChunk(chunk, payloadSize, STORY_BACKUP_LIMITS.maxPayloadBytes);
          payloadHasher?.update(chunk);
          if (chunk.byteLength) payloadChunks.push(chunk.slice());
          if (final) {
            checkCompressionRatio(file, payloadSize);
            const digest = bytesToHex(payloadHasher!.digest());
            payloadHasher!.clean();
            payloadHasher = null;
            if (payloadSize !== expectedManifest.payload.size
              || digest !== expectedManifest.payload.sha256) {
              throw new Error('Story backup payload hash mismatch');
            }
          }
        });
        file.start();
        return;
      }

      const asset = expectedObjects.get(file.name);
      if (!asset) throw new Error(`Unexpected story backup object: ${file.name}`);
      const hasher = new Hash();
      let objectSize = 0;
      const sinkPromise = Promise.resolve(createObjectSink(asset)).then((sink) => {
        openedSinks.add(sink);
        return sink;
      });
      file.ondata = (error, chunk, final) => queue(async () => {
        if (error) throw error;
        objectSize = checkChunk(chunk, objectSize, STORY_BACKUP_LIMITS.maxObjectBytes);
        if (objectSize > asset.size) throw new Error(`Story backup object exceeds declared size: ${asset.assetId}`);
        hasher.update(chunk);
        const sink = await sinkPromise;
        if (chunk.byteLength) await sink.write(chunk);
        if (final) {
          checkCompressionRatio(file, objectSize);
          const digest = bytesToHex(hasher.digest());
          hasher.clean();
          if (objectSize !== asset.size || digest !== asset.sha256) {
            throw new Error(`Story backup object hash mismatch: ${asset.assetId}`);
          }
          results.set(asset.sha256, await sink.close());
          openedSinks.delete(sink);
        }
      });
      file.start();
    } catch (error) {
      failure ??= error;
    }
  });
  unzip.register(UnzipInflate);

  try {
    for await (const chunk of source.open()) {
      unzip.push(chunk, false);
      await pending;
      if (failure !== undefined) throw failure;
    }
    unzip.push(EMPTY_BYTES, true);
    await pending;
    if (failure !== undefined) throw failure;
    if (!seenPaths.has(STORY_BACKUP_PATHS.manifest)
      || !seenPaths.has(STORY_BACKUP_PATHS.payload)) {
      throw new Error('Story backup is missing manifest or payload');
    }
    for (const path of expectedObjects.keys()) {
      if (!seenPaths.has(path)) throw new Error(`Story backup is missing object: ${path}`);
    }
    if (source.size && totalBytes / source.size > STORY_BACKUP_LIMITS.maxCompressionRatio) {
      throw new Error('Story backup has an unsafe total compression ratio');
    }

    const actualManifest = parseStoryArchiveManifest(
      JSON.parse(strFromU8(concatChunks(manifestChunks, manifestSize))),
    );
    if (JSON.stringify(actualManifest) !== JSON.stringify(expectedManifest)) {
      throw new Error('Story backup manifest changed during import');
    }
    const payload = parseStoryArchivePayload(
      JSON.parse(strFromU8(concatChunks(payloadChunks, payloadSize))),
    );
    return { payload, objects: results };
  } catch (error) {
    payloadHasher?.clean();
    await Promise.all(Array.from(openedSinks, (sink) => sink.abort(error).catch(() => undefined)));
    throw error;
  }
}
