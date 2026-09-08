/**
 * The bytes a release is made of, kept where the release can always find them.
 *
 * RELEASE-PLAN.md decided this in R2 — "one object store keyed by SHA-256, plus
 * one manifest per release" — and then it was not built. Publishing hashed the
 * media and threw the bytes away, on the reasoning that the media library still
 * had them. It does, right up until the author replaces a picture, deletes a
 * library entry, or upgrades the engine past a bundled asset. Then a release
 * that is supposed to be immutable can no longer be exported at all, and the
 * only sign of it is an error at the worst moment.
 *
 * Content addressing is what makes this affordable: two releases of the same
 * novel share every unchanged file, so v1.1 costs only what actually changed.
 * The index below is the reference count that lets a deleted release take its
 * own objects with it and nobody else's.
 *
 * The index is also what keeps the objects alive on web. `lib/web-media-cleanup.ts`
 * decides what to collect by scanning persisted values for `idb://media/…`
 * strings; the uris live in the index, so storing it *is* the pinning.
 */
import { Platform } from 'react-native';

import {
  createMediaBlobUri,
  deleteMediaBlob,
  getMediaBlob,
  hasMediaBlob,
  putMediaBlob,
} from '@/lib/idb-storage';
import { createPersistentStorage, type StorageLike } from '@/lib/persistent-storage';
import { sourceFromBlob } from '@/lib/story-backup/hash';
import type {
  PreparedStoryBackupAsset,
  StoryArchiveBinarySource,
} from '@/lib/story-backup/types';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { withReleaseStorageLock } from '@/lib/release/storage-lock';

export const RELEASE_OBJECT_STORAGE_VERSION = 1;

export interface ReleaseObjectEntry {
  /** Where the bytes are: `idb://media/…` on web, `file://…` on native. */
  uri: string;
  size: number;
  mimeType: string;
  /** Which releases still need it. Empty means the object may go. */
  releaseIds: string[];
}

export interface ReleaseObjectIndex {
  version: number;
  objects: Record<string, ReleaseObjectEntry>;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Namespaced so a release object is never mistaken for a library asset. */
export function releaseObjectStorageKey(sha256: string): string {
  if (!SHA256_PATTERN.test(sha256)) throw new Error(`Not a content hash: ${sha256}`);
  return `release-object/${sha256}`;
}

function safeExtension(value: string | undefined): string {
  return value && /^\.[a-z0-9]{1,12}$/i.test(value) ? value.toLowerCase() : '.bin';
}

function emptyIndex(): ReleaseObjectIndex {
  return { version: RELEASE_OBJECT_STORAGE_VERSION, objects: {} };
}

function parseIndex(raw: string | null): ReleaseObjectIndex {
  if (!raw) return emptyIndex();
  try {
    const parsed = JSON.parse(raw) as ReleaseObjectIndex;
    if (!parsed || typeof parsed !== 'object' || !parsed.objects) return emptyIndex();
    return { version: RELEASE_OBJECT_STORAGE_VERSION, objects: parsed.objects };
  } catch {
    return emptyIndex();
  }
}

export async function readReleaseObjectIndex(
  storage: StorageLike = createPersistentStorage(),
): Promise<ReleaseObjectIndex> {
  return parseIndex(await storage.getItem(STORAGE_KEYS.RELEASE_OBJECTS));
}

async function writeIndex(storage: StorageLike, index: ReleaseObjectIndex): Promise<void> {
  await storage.setItem(STORAGE_KEYS.RELEASE_OBJECTS, JSON.stringify(index));
}

async function readAll(source: StoryArchiveBinarySource): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of source.open()) {
    chunks.push(chunk.slice());
    size += chunk.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function writeObject(asset: PreparedStoryBackupAsset): Promise<string> {
  const { metadata, source } = asset;
  const bytes = await readAll(source);

  if (Platform.OS === 'web') {
    const storageKey = releaseObjectStorageKey(metadata.sha256);
    if (!await hasMediaBlob(storageKey)) {
      await putMediaBlob(storageKey, new Blob([bytes as BlobPart], { type: metadata.mimeType }));
    }
    return createMediaBlobUri(storageKey);
  }

  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, 'vne-release-objects');
  if (!directory.exists) directory.create({ intermediates: true });
  const file = new File(directory, `${metadata.sha256}${safeExtension(metadata.originalExtension)}`);
  if (!file.exists) {
    file.create({ overwrite: true });
    file.write(bytes);
  }
  return file.uri;
}

export interface SaveReleaseObjectsResult {
  index: ReleaseObjectIndex;
  stored: string[];
  /** Objects the device would not store. See the note below. */
  failed: string[];
}

/**
 * Store every distinct object a release needs and record that it needs them.
 *
 * Deduplicated by hash: a picture used in four scenes is written once, and one
 * already stored by an earlier release is not rewritten at all.
 */
export async function saveReleaseObjects(
  releaseId: string,
  assets: PreparedStoryBackupAsset[],
  storage: StorageLike = createPersistentStorage(),
): Promise<SaveReleaseObjectsResult> {
  return withReleaseStorageLock('release-objects', async () => {
    const index = await readReleaseObjectIndex(storage);
    const seen = new Set<string>();
    const stored: string[] = [];
    const failed: string[] = [];

    for (const asset of assets) {
      const { sha256 } = asset.metadata;
      if (seen.has(sha256)) continue;
      seen.add(sha256);

      const existing = index.objects[sha256];
      let uri = existing?.uri;
      if (!uri) {
        try {
          uri = await writeObject(asset);
        } catch {
          // A device with no blob storage — a private window, a browser with
          // site data switched off — must still be able to publish. The release
          // is saved either way and exporting falls back to the media library,
          // which is what every release did before this store existed. Failing
          // the publish would trade a weaker guarantee for no release at all.
          failed.push(sha256);
          continue;
        }
      }

      const releaseIds = new Set(existing?.releaseIds ?? []);
      releaseIds.add(releaseId);
      index.objects[sha256] = {
        uri,
        size: asset.metadata.size,
        mimeType: asset.metadata.mimeType,
        releaseIds: [...releaseIds],
      };
      stored.push(sha256);
    }

    await writeIndex(storage, index);
    return { index, stored, failed };
  });
}

/** The bytes of one object, or `null` when this release predates the store. */
export async function readReleaseObject(
  sha256: string,
  storage: StorageLike = createPersistentStorage(),
): Promise<StoryArchiveBinarySource | null> {
  const index = await readReleaseObjectIndex(storage);
  const entry = index.objects[sha256];
  if (!entry) return null;

  if (Platform.OS === 'web') {
    const blob = await getMediaBlob(releaseObjectStorageKey(sha256));
    return blob ? sourceFromBlob(blob) : null;
  }

  const { File } = await import('expo-file-system');
  const file = new File(entry.uri);
  if (!file.exists) return null;
  const { sourceFromReadableStream } = await import('@/lib/story-backup/hash');
  return sourceFromReadableStream(() => file.readableStream(), file.size);
}

async function removeObject(sha256: string, uri: string): Promise<void> {
  if (Platform.OS === 'web') {
    await deleteMediaBlob(releaseObjectStorageKey(sha256)).catch(() => undefined);
    return;
  }
  try {
    const { File } = await import('expo-file-system');
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A file already gone is the outcome we wanted.
  }
}

/**
 * Drop one release's claim on its objects, deleting those nothing else needs.
 *
 * Refusing to delete a shared object is the whole point of the count: two
 * versions of a novel usually differ by a page of text, and deleting v1 must not
 * take v2's artwork with it.
 */
export async function forgetReleaseObjects(
  releaseId: string,
  storage: StorageLike = createPersistentStorage(),
): Promise<{ deleted: string[]; kept: string[] }> {
  return withReleaseStorageLock('release-objects', async () => {
    const index = await readReleaseObjectIndex(storage);
    const deleted: Array<{ sha256: string; uri: string }> = [];
    const kept: string[] = [];

    for (const [sha256, entry] of Object.entries(index.objects)) {
      if (!entry.releaseIds.includes(releaseId)) continue;
      const remaining = entry.releaseIds.filter((id) => id !== releaseId);
      if (remaining.length > 0) {
        index.objects[sha256] = { ...entry, releaseIds: remaining };
        kept.push(sha256);
        continue;
      }
      delete index.objects[sha256];
      deleted.push({ sha256, uri: entry.uri });
    }

    // Commit the reference-count update first. A crash after this write can
    // leave an orphaned blob for cleanup, but never an index that promises
    // bytes we already deleted.
    await writeIndex(storage, index);
    for (const entry of deleted) await removeObject(entry.sha256, entry.uri);
    return { deleted: deleted.map((entry) => entry.sha256), kept };
  });
}
