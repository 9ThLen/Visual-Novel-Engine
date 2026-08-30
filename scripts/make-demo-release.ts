/**
 * Build a `.vnerelease` from a story JSON on disk.
 *
 * The app is the real producer of releases — `lib/release/compile.ts` freezes an
 * author's working copy and `lib/release/package.ts` writes the container. That
 * path needs the app's store, so until the in-app export exists (R6 in
 * RELEASE-PLAN.md) there is no way to *get* a release file to hand to the
 * exporter. This makes one, using the same writer and the same manifest parser
 * the app uses, so what comes out is a real release rather than a mock.
 *
 * `--media` is the point of it. A story JSON can only name art that ships with
 * the app; the case worth testing is art that came from the media library, which
 * a story refers to by an `idb-media://` uri naming a database on the author's
 * own machine. Passing a file here packages those bytes and rewrites the
 * opening scene's background to point at them — the exact shape a real release
 * has, and the one the legacy exporter could never publish.
 *
 * Usage:
 *   pnpm demo:release --story assets/demo-story-advanced.json --out demo.vnerelease
 *                     [--media assets/background/bg-museum-entrance.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';


import { parseReleaseManifest } from '@/lib/release/manifest';
import { writeReleaseArchive } from '@/lib/release/package';
import {
  RELEASE_CONTAINER_VERSION,
  RELEASE_FORMAT,
  RELEASE_PATHS,
  RELEASE_SCHEMA_VERSION,
  MIN_ENGINE_VERSION_FOR_RELEASE_V1,
  type ReleaseAsset,
  type ReleaseManifestV1,
  type ReleasePayloadV1,
} from '@/lib/release/types';
import { buildCanonicalSceneRecordsFromLegacyScenes } from '@/lib/scene-operations';
import { sha256Chunks, sourceFromBytes } from '@/lib/story-backup/hash';
import type {
  PreparedStoryBackupAsset,
  StoryArchiveBinarySink,
} from '@/lib/story-backup/types';
import type { SceneRecord } from '@/lib/engine/types';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The uri an author's browser would have stored for media-library art. */
const PACKAGED_MEDIA_REFERENCE = 'idb-media://demo-release-media';
const PACKAGED_ASSET_ID = 'demo-release-media';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
};

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args: { story?: string; out?: string; media?: string; version: string } = {
    version: '1.0.0',
  };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--story': args.story = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--media': args.media = argv[++i]; break;
      case '--version': args.version = argv[++i]; break;
      default:
        if (argv[i].startsWith('--')) fail(`Unknown option: ${argv[i]}`);
    }
  }
  return args;
}

function fileSink(file: string): StoryArchiveBinarySink {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const handle = fs.openSync(file, 'w');
  return {
    async write(chunk) {
      fs.writeSync(handle, chunk);
    },
    async close() {
      fs.closeSync(handle);
    },
    async abort() {
      try { fs.closeSync(handle); } catch { /* already closed */ }
      fs.rmSync(file, { force: true });
    },
  };
}

function countWords(scenes: SceneRecord[]): number {
  let words = 0;
  for (const scene of scenes) {
    for (const step of scene.timeline ?? []) {
      const content = (step.data as { content?: unknown } | undefined)?.content;
      if (typeof content === 'string') words += content.split(/\s+/).filter(Boolean).length;
    }
  }
  return words;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.story) fail('--story is required');
  if (!args.out) fail('--out is required');

  const storyPath = path.resolve(process.cwd(), args.story);
  if (!fs.existsSync(storyPath)) fail(`No such story JSON: ${storyPath}`);
  const raw = JSON.parse(fs.readFileSync(storyPath, 'utf8'));

  const scenes = buildCanonicalSceneRecordsFromLegacyScenes(raw.id, raw.scenes, raw.startSceneId);
  const sceneList = Object.values(scenes);
  if (!sceneList.length) fail('The story has no scenes');

  const assets: PreparedStoryBackupAsset[] = [];
  if (args.media) {
    const mediaPath = path.resolve(process.cwd(), args.media);
    if (!fs.existsSync(mediaPath)) fail(`No such media file: ${mediaPath}`);
    const bytes = new Uint8Array(fs.readFileSync(mediaPath));
    const digest = await sha256Chunks(sourceFromBytes(bytes).open());
    const extension = path.extname(mediaPath).toLowerCase();

    const metadata: ReleaseAsset = {
      assetId: PACKAGED_ASSET_ID,
      sourceReferences: [PACKAGED_ASSET_ID, PACKAGED_MEDIA_REFERENCE],
      sha256: digest.sha256,
      size: digest.size,
      kind: 'image',
      mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
      originalName: path.basename(mediaPath),
      originalExtension: extension,
      archivePath: `${RELEASE_PATHS.objectPrefix}${digest.sha256}`,
    };
    assets.push({ metadata, source: sourceFromBytes(bytes) });

    // Point the opening scene at the packaged bytes, the way a story authored
    // against the media library would.
    const start = scenes[raw.startSceneId] ?? sceneList[0];
    start.sceneState.backgroundAssetId = PACKAGED_MEDIA_REFERENCE;
    for (const step of start.timeline ?? []) {
      if (step.blockType === 'background') {
        (step.data as { assetId?: string }).assetId = PACKAGED_MEDIA_REFERENCE;
      }
    }
  }

  const payload: ReleasePayloadV1 = { scenes, characters: [], audioLibrary: [] };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadDigest = await sha256Chunks(sourceFromBytes(payloadBytes).open());

  const releasedAt = new Date().toISOString();
  const words = countWords(sceneList);
  const terminalSceneIds = sceneList
    .filter((scene) => !Array.isArray(scene.connections) || scene.connections.length === 0)
    .map((scene) => scene.id);

  const manifest: ReleaseManifestV1 = {
    format: RELEASE_FORMAT,
    containerVersion: RELEASE_CONTAINER_VERSION,
    schemaVersion: RELEASE_SCHEMA_VERSION,
    createdAt: releasedAt,
    appVersion: '1.0.0',
    story: {
      id: raw.id,
      title: raw.title,
      description: raw.description ?? '',
      author: raw.author ?? 'Demo author',
      startSceneId: raw.startSceneId,
      createdAt: raw.createdAt ?? Date.parse(releasedAt),
      updatedAt: raw.updatedAt ?? Date.parse(releasedAt),
      sceneCount: sceneList.length,
      languages: ['en'],
      contentRating: 'everyone',
    },
    release: {
      releaseId: `rel_${raw.id}_${args.version.replace(/\./g, '_')}`,
      storyId: raw.id,
      version: args.version,
      channel: 'both',
      releasedAt,
      engineVersion: '1.0.0',
      minEngineVersion: MIN_ENGINE_VERSION_FOR_RELEASE_V1,
      payloadHash: payloadDigest.sha256,
      publication: {
        author: raw.author ?? 'Demo author',
        languages: ['en'],
        contentRating: 'everyone',
      },
      stats: {
        scenes: sceneList.length,
        words,
        readMinutes: Math.max(1, Math.round(words / 200)),
        endings: terminalSceneIds.length,
        branches: sceneList.reduce((total, scene) => total + (scene.connections?.length ?? 0), 0),
      },
      showcase: {
        teaser: null,
        bannerBackgroundAssetId: sceneList[0]?.sceneState.backgroundAssetId ?? null,
        terminalSceneIds,
      },
    },
    counts: {
      scenes: sceneList.length,
      characters: 0,
      audioItems: 0,
      embeddedAssets: assets.length,
      totalAssetBytes: assets.reduce((total, asset) => total + asset.metadata.size, 0),
    },
    payload: {
      archivePath: RELEASE_PATHS.payload,
      sha256: payloadDigest.sha256,
      size: payloadDigest.size,
    },
    assets: assets.map((asset) => asset.metadata),
  };

  // Same gate the app goes through, so a fixture cannot be something the app
  // could never have produced.
  parseReleaseManifest(JSON.parse(JSON.stringify(manifest)));

  const outPath = path.resolve(process.cwd(), args.out);
  await writeReleaseArchive({ manifest, payloadBytes, assets }, fileSink(outPath));

  const size = fs.statSync(outPath).size;
  console.log(`✔ ${path.relative(REPO_ROOT, outPath)} — ${sceneList.length} scenes, ${assets.length} packaged object(s), ${(size / 1024).toFixed(1)} kB`);
  if (args.media) console.log(`  Opening scene background: ${PACKAGED_MEDIA_REFERENCE}`);
}

void main();
