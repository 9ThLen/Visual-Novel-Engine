/**
 * Writing and reading a `.vnerelease` file.
 *
 * The container is the backup container — same zip, same
 * `manifest.json` + `story.json` + `objects/<sha256>` layout — so the streaming,
 * the hash verification and the entry-order safety all come from
 * `lib/story-backup/archive.ts` rather than from a second copy. What differs is
 * the manifest inside and the parser that validates it.
 *
 * `lib/release/compile.ts` produces everything this needs. In particular it
 * hands over the exact `payloadBytes` it hashed: re-serializing the payload here
 * could produce different bytes for the same object (key order, number
 * formatting) and the digest in the manifest would then describe a file nobody
 * wrote.
 */
import {
  readArchiveManifestBytes,
  readArchivePayloadBytes,
  writeArchiveContainer,
} from '@/lib/story-backup/archive';
import {
  extractArchive,
  type ArchiveExtractionSpec,
  type ExtractedArchive,
  type StoryArchiveObjectSink,
} from '@/lib/story-backup/extract';
import type {
  PreparedStoryBackupAsset,
  StoryArchiveBinarySink,
  StoryArchiveBinarySource,
  StoryBackupAsset,
} from '@/lib/story-backup/types';
import {
  buildReleasePreview,
  parseReleaseManifest,
  parseReleasePayload,
} from '@/lib/release/manifest';
import {
  RELEASE_LIMITS,
  type ReleaseManifestV1,
  type ReleasePayloadV1,
  type ReleasePreview,
} from '@/lib/release/types';

/** The file extension a released bundle is handed to a reader under. */
export const RELEASE_FILE_EXTENSION = 'vnerelease';

const CONTAINER_LABEL = 'Release' as const;

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}

export interface WriteReleaseArchiveInput {
  manifest: ReleaseManifestV1;
  /** The exact bytes the manifest's `payload.sha256` was taken over. */
  payloadBytes: Uint8Array;
  assets: PreparedStoryBackupAsset[];
}

/**
 * Stream one release into `sink` and return the manifest as written.
 *
 * The manifest goes through `parseReleaseManifest` on the way out. A writer that
 * can emit a file its own reader rejects is a bug that would otherwise surface
 * only when someone tried to open it — and by then the author has already
 * handed the file to someone.
 */
export async function writeReleaseArchive(
  input: WriteReleaseArchiveInput,
  sink: StoryArchiveBinarySink,
): Promise<ReleaseManifestV1> {
  if (input.payloadBytes.byteLength > RELEASE_LIMITS.maxPayloadBytes) {
    throw new Error('Release payload is too large');
  }
  if (input.payloadBytes.byteLength !== input.manifest.payload.size) {
    throw new Error('Release payload does not match the size its manifest declares');
  }

  const manifest = parseReleaseManifest(input.manifest);
  const manifestBytes = encodeJson(manifest);
  if (manifestBytes.byteLength > RELEASE_LIMITS.maxManifestBytes) {
    throw new Error('Release manifest is too large');
  }

  await writeArchiveContainer(
    { manifestBytes, payloadBytes: input.payloadBytes, assets: input.assets },
    sink,
  );
  return manifest;
}

/** Read only the manifest. Stops at the first entry, so a listing is cheap. */
export async function readReleaseManifest(
  source: StoryArchiveBinarySource,
): Promise<ReleaseManifestV1> {
  const bytes = await readArchiveManifestBytes(
    source,
    CONTAINER_LABEL,
    RELEASE_LIMITS.maxManifestBytes,
  );
  try {
    return parseReleaseManifest(decodeJson(bytes));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Invalid release manifest JSON');
    throw error;
  }
}

export async function previewReleaseArchive(
  source: StoryArchiveBinarySource,
): Promise<ReleasePreview> {
  return buildReleasePreview(await readReleaseManifest(source));
}

export async function readReleasePayload(
  source: StoryArchiveBinarySource,
  manifest: ReleaseManifestV1,
): Promise<ReleasePayloadV1> {
  const bytes = await readArchivePayloadBytes(
    source,
    manifest.payload,
    CONTAINER_LABEL,
    RELEASE_LIMITS.maxPayloadBytes,
  );
  try {
    return parseReleasePayload(decodeJson(bytes));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Invalid release payload JSON');
    throw error;
  }
}

const RELEASE_EXTRACTION: ArchiveExtractionSpec<ReleaseManifestV1, ReleasePayloadV1> = {
  label: CONTAINER_LABEL,
  parseManifest: parseReleaseManifest,
  parsePayload: parseReleasePayload,
};

/**
 * Read the payload and every packaged object, verifying each against the
 * manifest as it streams.
 *
 * `expectedManifest` must be the manifest already read from this same file:
 * extraction re-parses the one in the archive and refuses to continue if the two
 * differ, which is what stops a caller from validating one manifest and
 * unpacking the objects of another.
 */
export function extractReleaseArchive<TResult>(
  source: StoryArchiveBinarySource,
  expectedManifest: ReleaseManifestV1,
  createObjectSink: (
    asset: StoryBackupAsset,
  ) => Promise<StoryArchiveObjectSink<TResult>> | StoryArchiveObjectSink<TResult>,
  maxTotalBytes?: number,
): Promise<ExtractedArchive<ReleasePayloadV1, TResult>> {
  return extractArchive(
    source,
    expectedManifest,
    createObjectSink,
    RELEASE_EXTRACTION,
    maxTotalBytes,
  );
}
