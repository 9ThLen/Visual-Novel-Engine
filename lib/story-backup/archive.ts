import {
  Unzip,
  UnzipInflate,
  Zip,
  ZipDeflate,
  ZipPassThrough,
  strFromU8,
  strToU8,
  type UnzipFile,
} from 'fflate';
import { Hash } from 'fast-sha256';

import { sha256Chunks, sourceFromBytes } from '@/lib/story-backup/hash';
import {
  buildStoryArchivePreview,
  parseStoryArchiveManifest,
  parseStoryArchivePayload,
} from '@/lib/story-backup/manifest';
import {
  STORY_BACKUP_CONTAINER_VERSION,
  STORY_BACKUP_FORMAT,
  STORY_BACKUP_LIMITS,
  STORY_BACKUP_PATHS,
  STORY_BACKUP_SCHEMA_VERSION,
  type PreparedStoryBackupAsset,
  type StoryArchiveBinarySink,
  type StoryArchiveBinarySource,
  type StoryArchiveManifestV1,
  type StoryArchivePayloadV1,
  type StoryArchivePreview,
} from '@/lib/story-backup/types';
import type { StoryMetadata } from '@/lib/story-domain';

const EMPTY_BYTES = new Uint8Array();
const SAFE_ENTRY_PATTERN = /^(manifest\.json|story\.json|objects\/[a-f0-9]{64})$/;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function assertSafeEntryPath(path: string): void {
  if (!SAFE_ENTRY_PATTERN.test(path) || path.includes('\\') || path.includes('..')) {
    throw new Error(`Unsafe or unexpected story backup entry: ${path}`);
  }
}

class QueuedZipSink {
  private pending = Promise.resolve();
  private failure: unknown;

  constructor(private readonly sink: StoryArchiveBinarySink) {}

  push(error: Error | null, chunk: Uint8Array, _final: boolean): void {
    if (error && this.failure === undefined) this.failure = error;
    if (!chunk.byteLength || this.failure !== undefined) return;
    const stableChunk = chunk.slice();
    this.pending = this.pending
      .then(() => this.sink.write(stableChunk))
      .catch((sinkError) => {
        this.failure ??= sinkError;
      });
  }

  async drain(): Promise<void> {
    await this.pending;
    if (this.failure !== undefined) throw this.failure;
  }
}

async function writeZipFile(
  zip: Zip,
  output: QueuedZipSink,
  file: ZipPassThrough | ZipDeflate,
  source: StoryArchiveBinarySource,
  expected?: { sha256: string; size: number },
): Promise<void> {
  zip.add(file);
  const hasher = expected ? new Hash() : null;
  let size = 0;

  try {
    for await (const chunk of source.open()) {
      size += chunk.byteLength;
      if (expected && size > expected.size) throw new Error(`Story backup object changed while archiving: ${file.filename}`);
      hasher?.update(chunk);
      file.push(chunk, false);
      await output.drain();
    }
    if (expected) {
      const actualHash = bytesToHex(hasher!.digest());
      if (size !== expected.size || actualHash !== expected.sha256) {
        throw new Error(`Story backup object changed while archiving: ${file.filename}`);
      }
    }
    file.push(EMPTY_BYTES, true);
    await output.drain();
  } finally {
    hasher?.clean();
  }
}

export interface WriteStoryArchiveInput {
  story: StoryMetadata;
  payload: StoryArchivePayloadV1;
  assets: PreparedStoryBackupAsset[];
  appVersion: string;
  createdAt?: Date;
}

export async function writeStoryArchive(
  input: WriteStoryArchiveInput,
  sink: StoryArchiveBinarySink,
): Promise<StoryArchiveManifestV1> {
  const payloadBytes = strToU8(JSON.stringify(input.payload));
  if (payloadBytes.byteLength > STORY_BACKUP_LIMITS.maxPayloadBytes) {
    throw new Error('Story backup payload is too large');
  }
  const payloadDigest = await sha256Chunks(sourceFromBytes(payloadBytes).open());
  const assets = input.assets.map((asset) => asset.metadata);
  const manifest: StoryArchiveManifestV1 = {
    format: STORY_BACKUP_FORMAT,
    containerVersion: STORY_BACKUP_CONTAINER_VERSION,
    schemaVersion: STORY_BACKUP_SCHEMA_VERSION,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    appVersion: input.appVersion,
    story: structuredClone(input.story),
    counts: {
      scenes: Object.keys(input.payload.scenes).length,
      characters: input.payload.characters.length,
      audioItems: input.payload.audioLibrary.length,
      embeddedAssets: assets.length,
      totalAssetBytes: assets.reduce((total, asset) => total + asset.size, 0),
    },
    payload: {
      archivePath: STORY_BACKUP_PATHS.payload,
      sha256: payloadDigest.sha256,
      size: payloadDigest.size,
    },
    assets: structuredClone(assets),
  };
  const normalizedManifest = parseStoryArchiveManifest(manifest);
  const manifestBytes = strToU8(JSON.stringify(normalizedManifest));
  if (manifestBytes.byteLength > STORY_BACKUP_LIMITS.maxManifestBytes) {
    throw new Error('Story backup manifest is too large');
  }

  await writeArchiveContainer({ manifestBytes, payloadBytes, assets: input.assets }, sink);
  return normalizedManifest;
}

/**
 * Stream one container: manifest, then payload, then each distinct object.
 *
 * The layout belongs to the container, not to what is inside it — a
 * `.vnerelease` is the same zip with a different manifest (see
 * `lib/release/types.ts`), so it streams through here rather than through a
 * second copy of this. The order matters: readers below rely on the manifest
 * arriving first, which is what lets a preview cost one entry instead of a
 * whole file.
 */
export interface ArchiveContainerInput {
  manifestBytes: Uint8Array;
  payloadBytes: Uint8Array;
  assets: PreparedStoryBackupAsset[];
}

export async function writeArchiveContainer(
  input: ArchiveContainerInput,
  sink: StoryArchiveBinarySink,
): Promise<void> {
  const output = new QueuedZipSink(sink);
  const zip = new Zip((error, chunk, final) => output.push(error, chunk, final));
  const uniqueObjects = new Map<string, PreparedStoryBackupAsset>();
  for (const asset of input.assets) {
    const existing = uniqueObjects.get(asset.metadata.sha256);
    if (existing && existing.metadata.size !== asset.metadata.size) {
      throw new Error(`Conflicting story backup object: ${asset.metadata.sha256}`);
    }
    uniqueObjects.set(asset.metadata.sha256, existing ?? asset);
  }

  try {
    await writeZipFile(
      zip,
      output,
      new ZipDeflate(STORY_BACKUP_PATHS.manifest, { level: 6 }),
      sourceFromBytes(input.manifestBytes),
    );
    await writeZipFile(
      zip,
      output,
      new ZipDeflate(STORY_BACKUP_PATHS.payload, { level: 6 }),
      sourceFromBytes(input.payloadBytes),
    );
    for (const asset of uniqueObjects.values()) {
      await writeZipFile(
        zip,
        output,
        new ZipPassThrough(asset.metadata.archivePath),
        asset.source,
        asset.metadata,
      );
    }
    zip.end();
    await output.drain();
    await sink.close();
  } catch (error) {
    zip.terminate();
    await sink.abort?.(error).catch(() => undefined);
    throw error;
  }
}

/**
 * The container's human name, so the readers below can serve both the backup
 * and the release without two copies of them. Capitalised because it starts
 * most of these messages; the "Not a VNE ..." form lowercases it.
 */
type ContainerLabel = 'Story backup' | 'Release';

async function readLeadingEntry(
  source: StoryArchiveBinarySource,
  expectedPath: string,
  maxBytes: number,
  label: ContainerLabel = 'Story backup',
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let entryCount = 0;
  let settled = false;
  let resolveEntry!: (bytes: Uint8Array) => void;
  let rejectEntry!: (error: unknown) => void;
  const result = new Promise<Uint8Array>((resolve, reject) => {
    resolveEntry = resolve;
    rejectEntry = reject;
  });

  const unzip = new Unzip((file: UnzipFile) => {
    if (settled) return;
    entryCount += 1;
    try {
      assertSafeEntryPath(file.name);
      if (entryCount !== 1 || file.name !== expectedPath) {
        throw new Error(`${label} must start with ${expectedPath}`);
      }
      if (typeof file.originalSize === 'number' && file.originalSize > maxBytes) {
        throw new Error(`${label} entry exceeds the ${maxBytes}-byte limit`);
      }
      file.ondata = (error, chunk, final) => {
        if (settled) return;
        if (error) {
          settled = true;
          rejectEntry(error);
          return;
        }
        size += chunk.byteLength;
        if (size > maxBytes) {
          settled = true;
          rejectEntry(new Error(`${label} entry exceeds the ${maxBytes}-byte limit`));
          return;
        }
        if (chunk.byteLength) chunks.push(chunk.slice());
        if (final) {
          settled = true;
          resolveEntry(concatChunks(chunks, size));
        }
      };
      file.start();
    } catch (error) {
      settled = true;
      rejectEntry(error);
    }
  });
  unzip.register(UnzipInflate);

  try {
    for await (const chunk of source.open()) {
      unzip.push(chunk, false);
      if (settled) break;
    }
    if (!settled) unzip.push(EMPTY_BYTES, true);
    if (!settled) {
      settled = true;
      rejectEntry(new Error(`Not a VNE ${label.toLowerCase()}`));
    }
  } catch (error) {
    if (!settled) {
      settled = true;
      rejectEntry(error);
    }
  }
  return result;
}

/**
 * The manifest, still as bytes. Reading stops at the first entry, so a preview
 * costs one entry rather than the whole file — which is the reason the writer
 * puts the manifest first.
 */
export function readArchiveManifestBytes(
  source: StoryArchiveBinarySource,
  label: ContainerLabel = 'Story backup',
  maxBytes: number = STORY_BACKUP_LIMITS.maxManifestBytes,
): Promise<Uint8Array> {
  return readLeadingEntry(source, STORY_BACKUP_PATHS.manifest, maxBytes, label);
}

export async function readStoryArchiveManifest(
  source: StoryArchiveBinarySource,
): Promise<StoryArchiveManifestV1> {
  const bytes = await readArchiveManifestBytes(source);
  try {
    return parseStoryArchiveManifest(JSON.parse(strFromU8(bytes)));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Invalid story backup manifest JSON');
    throw error;
  }
}

export async function previewStoryArchive(
  source: StoryArchiveBinarySource,
): Promise<StoryArchivePreview> {
  return buildStoryArchivePreview(await readStoryArchiveManifest(source));
}

/**
 * The payload, still as bytes, with the manifest's digest already verified.
 *
 * Split from the parse step so the release container can reuse it: the bytes
 * are the same shape of thing in both, only the schema inside differs.
 */
export async function readArchivePayloadBytes(
  source: StoryArchiveBinarySource,
  expectedPayload: { sha256: string; size: number },
  label: ContainerLabel = 'Story backup',
  maxBytes: number = STORY_BACKUP_LIMITS.maxPayloadBytes,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let entryIndex = 0;
  let settled = false;
  let resolvePayload!: (bytes: Uint8Array) => void;
  let rejectPayload!: (error: unknown) => void;
  const result = new Promise<Uint8Array>((resolve, reject) => {
    resolvePayload = resolve;
    rejectPayload = reject;
  });

  const unzip = new Unzip((file: UnzipFile) => {
    if (settled) return;
    entryIndex += 1;
    try {
      assertSafeEntryPath(file.name);
      const expected = entryIndex === 1 ? STORY_BACKUP_PATHS.manifest : STORY_BACKUP_PATHS.payload;
      if (file.name !== expected) {
        throw new Error(`Unexpected ${label.toLowerCase()} entry order: ${file.name}`);
      }
      if (entryIndex === 1) return;
      file.ondata = (error, chunk, final) => {
        if (settled) return;
        if (error) {
          settled = true;
          rejectPayload(error);
          return;
        }
        size += chunk.byteLength;
        if (size > maxBytes) {
          settled = true;
          rejectPayload(new Error(`${label} payload is too large`));
          return;
        }
        if (chunk.byteLength) chunks.push(chunk.slice());
        if (final) {
          settled = true;
          resolvePayload(concatChunks(chunks, size));
        }
      };
      file.start();
    } catch (error) {
      settled = true;
      rejectPayload(error);
    }
  });
  unzip.register(UnzipInflate);

  try {
    for await (const chunk of source.open()) {
      unzip.push(chunk, false);
      if (settled) break;
    }
    if (!settled) unzip.push(EMPTY_BYTES, true);
    if (!settled) {
      settled = true;
      rejectPayload(new Error(`Not a VNE ${label.toLowerCase()}`));
    }
  } catch (error) {
    if (!settled) {
      settled = true;
      rejectPayload(error);
    }
  }

  const bytes = await result;
  const digest = await sha256Chunks(sourceFromBytes(bytes).open(), maxBytes);
  if (digest.size !== expectedPayload.size || digest.sha256 !== expectedPayload.sha256) {
    throw new Error(`${label} payload hash mismatch`);
  }
  return bytes;
}

export async function readStoryArchivePayload(
  source: StoryArchiveBinarySource,
  manifest: StoryArchiveManifestV1,
): Promise<StoryArchivePayloadV1> {
  const bytes = await readArchivePayloadBytes(source, manifest.payload);
  try {
    return parseStoryArchivePayload(JSON.parse(strFromU8(bytes)));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Invalid story backup payload JSON');
    throw error;
  }
}
