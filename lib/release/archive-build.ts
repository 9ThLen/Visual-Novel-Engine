import { collectReleaseObjects, type ReleaseSourceResolver } from '@/lib/release/asset-sources';
import { writeReleaseArchive } from '@/lib/release/package';
import {
  readReleaseManifest,
  readReleasePayload,
} from '@/lib/release/release-storage';
import type { ReleaseManifestV1 } from '@/lib/release/types';
import { createPersistentStorage, type StorageLike } from '@/lib/persistent-storage';
import { sha256Chunks, sourceFromBlob, sourceFromBytes } from '@/lib/story-backup/hash';
import type { StoryArchiveBinarySink } from '@/lib/story-backup/types';

export interface BuiltReleaseArchive {
  blob: Blob;
  sha256: string;
  fileName: string;
  manifest: ReleaseManifestV1;
}

function safeFileName(title: string, version: string): string {
  const base = title.trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return `${base || 'story'}-v${version}.vnerelease`;
}

function blobSink(): { sink: StoryArchiveBinarySink; blob: () => Blob } {
  const chunks: Uint8Array[] = [];
  return {
    sink: {
      async write(chunk) { chunks.push(chunk.slice()); },
      async close() {},
      async abort() { chunks.length = 0; },
    },
    // Blob adopts the already-produced chunks without allocating the extra
    // archive-sized Uint8Array that the previous concatenation required.
    blob: () => new Blob(chunks, { type: 'application/zip' }),
  };
}

export async function buildStoredReleaseArchive(input: {
  storyId: string;
  releaseId: string;
  storage?: StorageLike;
  resolveSource?: ReleaseSourceResolver;
}): Promise<BuiltReleaseArchive> {
  const storage = input.storage ?? createPersistentStorage();
  const [manifest, payload] = await Promise.all([
    readReleaseManifest(storage, input.storyId, input.releaseId),
    readReleasePayload(storage, input.storyId, input.releaseId),
  ]);
  if (!manifest || !payload) throw new Error('That release is no longer stored on this device.');

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadDigest = await sha256Chunks(sourceFromBytes(payloadBytes).open());
  if (
    payloadDigest.sha256 !== manifest.payload.sha256
    || payloadDigest.size !== manifest.payload.size
  ) {
    throw new Error('The stored release payload no longer matches its immutable manifest.');
  }

  const objects = await collectReleaseObjects(manifest, {
    storage,
    resolveSource: input.resolveSource,
  });
  const assets = [...new Map(manifest.assets.map((asset) => [asset.sha256, asset])).values()]
    .map((metadata) => {
      const object = objects.get(metadata.sha256);
      if (!object) throw new Error(`Release object ${metadata.sha256} is missing.`);
      return { metadata, source: sourceFromBytes(object.bytes) };
    });

  const output = blobSink();
  await writeReleaseArchive({ manifest, payloadBytes, assets }, output.sink);
  const blob = output.blob();
  const digest = await sha256Chunks(sourceFromBlob(blob).open());
  return {
    blob,
    sha256: digest.sha256,
    fileName: safeFileName(manifest.story.title, manifest.release.version),
    manifest,
  };
}

export function releaseBuildRequestId(archiveSha256: string, target: 'apk' | 'aab'): string {
  if (!/^[a-f0-9]{64}$/.test(archiveSha256)) throw new Error('Invalid release archive hash.');
  return `build_${archiveSha256.slice(0, 48)}_${target}`;
}
