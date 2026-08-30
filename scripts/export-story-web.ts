/**
 * Player-web exporter.
 *
 * Turns ONE story into a self-contained, playable static web bundle:
 *
 *   pnpm export:story --release <file.vnerelease> --out <dir>   (preferred)
 *   pnpm export:story --story <id-or-json-path>   --out <dir>   (legacy)
 *
 * It builds (or reuses) the player-profile Expo web export, copies it to
 * `--out`, unpacks the release's media beside it, and inlines the boot config
 * into `index.html`. The app reads that config on load and launches straight
 * into the reader for the bundled story (see `lib/player-mode.ts`).
 *
 * **Why `--release` exists.** The legacy `--story` path can only publish art
 * that ships with the app, because a story JSON refers to everything else by
 * strings that mean something only on the author's device — an `idb-media://`
 * uri naming a browser database, a `file://` path naming a phone. A
 * `.vnerelease` carries the bytes, so a story whose art came from the media
 * library can finally be published. The legacy path stays for stories that are
 * only bundled assets, and for the demo stories in `assets/`.
 *
 * This runs under `tsx` rather than plain Node so it can use the same container
 * reader, the same manifest parser and the same asset-map rules as the app.
 * Those modules are free of React Native imports precisely so this is possible;
 * a second implementation of any of them would drift, and the extraction one is
 * where a malformed archive would do damage.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { collectStoryAssetRefs } from './lib/collect-story-assets.mjs';
import { assertSafeOutPath } from './lib/out-path.mjs';
import { hardenWebOutput } from './lib/harden-web-output.mjs';
import { inlineBundleFonts } from './lib/inline-bundle-fonts.mjs';
import { validateStoryGraph } from './lib/validate-story-graph.mjs';

import { releaseObjectFileName, RELEASE_MEDIA_DIR } from '@/lib/release/asset-map';
import { extractReleaseArchive, readReleaseManifest } from '@/lib/release/package';
import {
  buildPlayerBootConfig,
  findUnpackagedBundledReferences,
  inlinePlayerConfig as inlineIntoHtml,
  readInlinedPlayerConfig,
  PLAYER_BUNDLE_HTML_FILES,
  PLAYER_CONFIG_VERSION,
  type PlayerBootConfig,
} from '@/lib/release/player-bundle';
import type { ReleaseManifestV1 } from '@/lib/release/types';
import type {
  StoryArchiveBinarySource,
  StoryBackupAsset,
} from '@/lib/story-backup/types';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

type Profile = 'player' | 'studio';

interface Args {
  story?: string;
  release?: string;
  out?: string;
  dist?: string;
  baseUrl?: string;
  profile: Profile;
  build: boolean;
  skipBuild: boolean;
  strict: boolean;
  help: boolean;
}

const color = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function fail(message: string, details: string[] = []): never {
  console.error(color.red(`\n✖ ${message}`));
  for (const line of details) console.error(color.red(`    • ${line}`));
  console.error('');
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    profile: 'player',
    build: false,
    skipBuild: false,
    strict: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--story': args.story = argv[++i]; break;
      case '--release': args.release = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--dist': args.dist = argv[++i]; break;
      case '--base-url': args.baseUrl = argv[++i]; break;
      case '--profile': {
        const value = argv[++i];
        if (value !== 'player' && value !== 'studio') fail(`--profile must be player or studio, got "${value}"`);
        args.profile = value;
        break;
      }
      case '--build': args.build = true; break;
      case '--skip-build': args.skipBuild = true; break;
      case '--strict': args.strict = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        if (arg.startsWith('--')) fail(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Export one story as a self-contained playable web bundle.

Usage:
  pnpm export:story --release <file.vnerelease> --out <dir> [options]
  pnpm export:story --story <id|path> --out <dir> [options]

Options:
  --release <file>   A .vnerelease container. Carries its own media, so a story
                     whose art came from the media library can be published.
  --story <id|path>  Story id (looked up in assets/*.json) or path to a story
                     JSON. Only art bundled with the app can be published.
  --out <dir>        Output directory for the published bundle (required).
  --dist <dir>       Expo web build directory to reuse.
                     Default: dist-player, or dist with --profile studio.
  --profile <name>   player (default) or studio. The player profile has no
                     editor in it at all — see app-player/README.md.
  --base-url <path>  Pin the bundle to a path, e.g. /my-novel. A player bundle
                     is relative to itself by default and needs no base url.
  --build            Force a fresh 'expo export --platform web'.
  --skip-build       Never build; require an existing dist directory.
  --strict           Treat missing bundled asset references as errors.
  -h, --help         Show this help.
`);
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Resolve --story to a parsed story object, accepting a path or a story id. */
function resolveStory(storyArg: string): { story: any; source: string } {
  const asPath = path.resolve(process.cwd(), storyArg);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) {
    return { story: readJson(asPath), source: asPath };
  }

  // Treat as an id: scan assets/*.json for a matching story.
  const assetsDir = path.join(REPO_ROOT, 'assets');
  const candidates = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).filter((name) => name.endsWith('.json'))
    : [];
  for (const name of candidates) {
    const file = path.join(assetsDir, name);
    try {
      const parsed = readJson(file);
      if (parsed && parsed.id === storyArg) return { story: parsed, source: file };
    } catch {
      /* skip unreadable/non-story json */
    }
  }
  fail(`Could not resolve --story "${storyArg}" as a file path or a story id in assets/*.json`);
}

function validateStory(story: any, source: string) {
  const problems: string[] = [];
  if (!story || typeof story !== 'object') fail(`Story JSON is not an object: ${source}`);
  if (typeof story.id !== 'string' || !story.id.trim()) problems.push('missing "id"');
  if (typeof story.title !== 'string' || !story.title.trim()) problems.push('missing "title"');
  if (typeof story.startSceneId !== 'string' || !story.startSceneId.trim()) problems.push('missing "startSceneId"');
  if (!story.scenes || typeof story.scenes !== 'object' || Object.keys(story.scenes).length === 0) {
    problems.push('missing or empty "scenes"');
  }
  problems.push(...validateStoryGraph(story));
  if (problems.length) fail(`Invalid story JSON (${source})`, problems);
}

/**
 * Classify the story's asset references. Device-local references (file://,
 * blob:, media-library) can never be packaged from a bare story JSON and are
 * fatal immediately — no point building first. `bundled` refs are validated
 * against the actual build output later (see {@link verifyEmittedAssets}).
 */
function classifyStoryAssets(story: any) {
  const refs = collectStoryAssetRefs(story);
  const fatal: string[] = [];
  const bundled: string[] = [];
  let inline = 0;
  let remote = 0;

  for (const ref of refs) {
    if (ref.class === 'bundled') bundled.push(ref.uri);
    else if (ref.class === 'inline') inline += 1;
    else if (ref.class === 'remote') remote += 1;
    else fatal.push(`${ref.uri} (device-local reference — publish a .vnerelease instead, which carries the bytes)`);
  }

  if (fatal.length) {
    fail(`Story references ${fatal.length} asset(s) that cannot be published`, fatal);
  }
  return { total: refs.length, bundled, inline, remote };
}

/**
 * The authoritative asset check: is every referenced `assets/…` path actually
 * present in the built bundle? Metro hashes emitted assets, so a reference
 * `assets/x/y.png` is matched against `out/assets/**\/y.<hash>.png`. A reference
 * that is not emitted (not in the app's compiled asset map, or a dangling
 * content reference) is reported: the bundle stays playable without it, so it
 * warns by default and only fails under `--strict`.
 */
function verifyEmittedAssets(outPath: string, bundledUris: string[], { strict }: { strict: boolean }) {
  // Metro preserves the source directory structure and appends a 32-char
  // content hash: a reference `assets/x/y.png` is emitted at
  // `<out>/assets/assets/x/y.<hash>.png`. Strip the hash from each emitted file
  // to recover its canonical relative path and match on the *full* path — not
  // just the basename, which would false-positive when two assets in different
  // folders share a filename.
  const emitted = new Set(
    listFilesRecursive(path.join(outPath, 'assets')).map((file) => {
      const rel = path.relative(outPath, file).split(path.sep).join('/');
      return rel.replace(/\.[0-9a-f]{32}\.([^.]+)$/i, '.$1');
    }),
  );
  const missing: string[] = [];
  for (const uri of bundledUris) {
    const normalized = uri.split('\\').join('/').replace(/^\.?\//, '');
    if (!emitted.has(`assets/${normalized}`)) missing.push(uri);
  }

  if (missing.length) {
    if (strict) {
      fail(`${missing.length} bundled asset(s) referenced but not present in the build`, missing);
    }
    console.warn(color.yellow(`  ⚠ ${missing.length} bundled reference(s) not in the build (will not play):`));
    for (const uri of missing) console.warn(color.yellow(`      • ${uri}`));
  }
  return missing.length;
}

function defaultDistDir(profile: Profile): string {
  return profile === 'player' ? 'dist-player' : 'dist';
}

function ensureWebBuild(distDir: string, args: Args): string {
  const distPath = path.resolve(process.cwd(), distDir);
  const hasBuild = fs.existsSync(path.join(distPath, 'index.html'));

  if (hasBuild && !args.build) {
    console.log(color.dim(`  Reusing existing web build: ${distPath}`));
    return distPath;
  }
  if (args.skipBuild) {
    fail(`--skip-build set but no web build at ${distPath} (run 'expo export --platform web' first)`);
  }

  console.log(`  Running: expo export --platform web (${args.profile} profile)`);
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'node_modules', 'expo', 'bin', 'cli'), 'export', '--platform', 'web', '--output-dir', distDir],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        // The profile has to reach both app.config.js (router root, plugins)
        // and metro.config.js (blocked trees, store substitution), which is why
        // it travels as an environment variable rather than a CLI flag.
        ...(args.profile === 'player' ? { VNE_PROFILE: 'player' } : {}),
        // A player bundle is relative to itself by default. Expo's `baseUrl`
        // otherwise emits absolute `/_expo/…` paths, which need the bundle to
        // sit at the root of a host — the folder plays from a server and from
        // nowhere else, least of all from a double-click.
        VNE_WEB_BASE_URL: args.baseUrl ?? (args.profile === 'player' ? '.' : ''),
      },
    },
  );
  if (result.status !== 0) fail('expo export failed');
  if (!fs.existsSync(path.join(distPath, 'index.html'))) fail(`expo export produced no index.html in ${distPath}`);
  return distPath;
}

function copyBuild(distPath: string, outArg: string): string {
  const outPath = path.resolve(process.cwd(), outArg);
  if (outPath === distPath) fail('--out must differ from the build (--dist) directory');
  try {
    assertSafeOutPath(outPath, { repoRoot: REPO_ROOT });
  } catch (error) {
    fail((error as Error).message, ['Pass a dedicated path such as  --out ./story-dist']);
  }
  fs.rmSync(outPath, { recursive: true, force: true });
  fs.mkdirSync(outPath, { recursive: true });
  fs.cpSync(distPath, outPath, { recursive: true });
  return outPath;
}

/** The legacy `--story` path has no release block; everything else is shared. */
type PlayerConfigFile = PlayerBootConfig | Omit<PlayerBootConfig, 'release'>;

function writePlayerConfig(outPath: string, config: PlayerConfigFile): string {
  const file = path.join(outPath, 'player-config.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

/**
 * Put the boot config in `index.html` instead of beside it.
 *
 * A fetched `player-config.json` needs the right content type, needs the host
 * not to answer a missing file with `index.html` (every SPA fallback does), and
 * needs a relative url that survives whatever sub-path the bundle is served
 * from — three ways for a folder that "looks fine" to open on an empty screen.
 * Inlined, the config is simply there before the first paint.
 *
 * The escaping and the tag shape come from `lib/release/player-bundle.ts`, which
 * the in-app exporter uses too: the two must produce the same bundle.
 */
function inlinePlayerConfig(outPath: string, config: PlayerConfigFile): void {
  for (const name of PLAYER_BUNDLE_HTML_FILES) {
    const file = path.join(outPath, name);
    if (!fs.existsSync(file)) continue;
    try {
      fs.writeFileSync(file, inlineIntoHtml(fs.readFileSync(file, 'utf8'), config as PlayerBootConfig));
    } catch (error) {
      fail(`Could not inline the player config into ${name}`, [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }
}

function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

// ── Release path ────────────────────────────────────────────────────────────

/** A `.vnerelease` on disk, streamed rather than read whole. */
function fileSource(file: string): StoryArchiveBinarySource {
  const size = fs.statSync(file).size;
  return {
    size,
    async *open() {
      const stream = fs.createReadStream(file, { highWaterMark: 256 * 1024 });
      for await (const chunk of stream) yield new Uint8Array(chunk as Buffer);
    },
  };
}

/**
 * Write one packaged object into `<out>/media/`. The extractor verifies the
 * bytes against the manifest as they stream, so a file that finishes writing is
 * a file whose hash matched.
 */
function mediaFileSink(mediaDir: string, asset: StoryBackupAsset) {
  const fileName = releaseObjectFileName(asset);
  const target = path.join(mediaDir, fileName);
  const handle = fs.openSync(target, 'w');
  return {
    async write(chunk: Uint8Array): Promise<void> {
      fs.writeSync(handle, chunk);
    },
    async close(): Promise<string> {
      fs.closeSync(handle);
      return fileName;
    },
    async abort(): Promise<void> {
      // A half-written object must not survive: the next run would see a file
      // of the right name whose bytes nobody checked.
      try { fs.closeSync(handle); } catch { /* already closed */ }
      fs.rmSync(target, { force: true });
    },
  };
}

function describeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function exportFromRelease(args: Args): Promise<void> {
  const releasePath = path.resolve(process.cwd(), args.release as string);
  if (!fs.existsSync(releasePath)) fail(`No such release file: ${releasePath}`);

  // Only the first entry is read here; the objects come later, after the output
  // directory exists to write them into.
  let manifest: ReleaseManifestV1;
  try {
    manifest = await readReleaseManifest(fileSource(releasePath));
  } catch (error) {
    fail(`Could not read the release`, [error instanceof Error ? error.message : String(error)]);
  }

  const { release, story } = manifest;
  console.log(`  Story: ${color.green(story.title)} (${story.id})`);
  console.log(`  Release: ${color.green(`v${release.version}`)} ${color.dim(`${release.releaseId} · ${release.channel}`)}`);
  console.log(
    `  Media: ${manifest.counts.embeddedAssets} object(s), ` +
    `${describeBytes(manifest.counts.totalAssetBytes)}`,
  );

  const distPath = ensureWebBuild(args.dist ?? defaultDistDir(args.profile), args);
  // No CSP on a player bundle: `default-src 'self'` is unsatisfiable from a
  // `file://` page, and this folder is meant to be opened by double-clicking it.
  hardenWebOutput(distPath, { csp: args.profile !== 'player', fileProtocol: args.profile === 'player' });
  const outPath = copyBuild(distPath, args.out as string);

  // Fonts are CORS-restricted even from the same directory, and a `file://`
  // page has no origin to satisfy that — so they travel inside the code.
  if (args.profile === 'player') inlineBundleFonts(outPath);

  const mediaDir = path.join(outPath, RELEASE_MEDIA_DIR);
  fs.mkdirSync(mediaDir, { recursive: true });

  let payload;
  try {
    ({ payload } = await extractReleaseArchive(
      fileSource(releasePath),
      manifest,
      (asset) => mediaFileSink(mediaDir, asset),
    ));
  } catch (error) {
    fail('Could not unpack the release', [error instanceof Error ? error.message : String(error)]);
  }

  // A shell built by `pnpm build:web` carries no `assets/` directory, so a
  // reference the release did not package has nothing to resolve to. Warned
  // rather than fatal: a `--dist` pointing at a full Expo build still has those
  // files, and this path is often used exactly that way.
  const unpackaged = findUnpackagedBundledReferences(payload, manifest);
  if (unpackaged.length > 0) {
    if (args.strict) {
      fail(`${unpackaged.length} bundled reference(s) are not packaged in the release`, unpackaged);
    }
    console.warn(color.yellow(
      `  ⚠ ${unpackaged.length} bundled reference(s) are not packaged in the release.`,
    ));
    console.warn(color.yellow('    They will only play if --dist carries them:'));
    for (const reference of unpackaged) console.warn(color.yellow(`      • ${reference}`));
  }

  inlinePlayerConfig(outPath, buildPlayerBootConfig({ manifest, payload }));
  smokeCheck(outPath, { expectInline: true });

  const mediaFiles = listFilesRecursive(mediaDir);
  console.log(color.dim(`  Wrote ${mediaFiles.length} media file(s) to ${RELEASE_MEDIA_DIR}/`));
  console.log(color.dim(`  Inlined the boot config into index.html`));
  console.log(color.green(`\n✔ Published bundle ready: ${outPath}`));
  console.log(color.dim(`  Serve it with any static host, e.g.  npx serve ${path.relative(process.cwd(), outPath)}\n`));
}

// ── Legacy story-JSON path ──────────────────────────────────────────────────

function exportFromStoryJson(args: Args): void {
  const { story, source } = resolveStory(args.story as string);
  validateStory(story, source);
  console.log(`  Story: ${color.green(story.title)} (${story.id})`);
  console.log(color.dim(`  Source: ${source}`));

  const assetSummary = classifyStoryAssets(story);
  console.log(
    `  Assets: ${assetSummary.total} referenced — ` +
    `${assetSummary.bundled.length} bundled, ${assetSummary.inline} inline, ${assetSummary.remote} remote`,
  );

  const distPath = ensureWebBuild(args.dist ?? defaultDistDir(args.profile), args);
  hardenWebOutput(distPath, { csp: args.profile !== 'player', fileProtocol: args.profile === 'player' });
  const outPath = copyBuild(distPath, args.out as string);

  const config: PlayerConfigFile = {
    version: PLAYER_CONFIG_VERSION,
    generatedAt: new Date().toISOString(),
    story,
  };
  // Both forms: the inline one is what the app reads, and the file stays so an
  // existing bundle's config can still be inspected or replaced by hand.
  if (args.profile === 'player') inlineBundleFonts(outPath);
  const configFile = writePlayerConfig(outPath, config);
  inlinePlayerConfig(outPath, config);
  console.log(color.dim(`  Wrote ${path.relative(process.cwd(), configFile)} and inlined it into index.html`));

  verifyEmittedAssets(outPath, assetSummary.bundled, args);
  smokeCheck(outPath, { expectInline: true });

  console.log(color.green(`\n✔ Published bundle ready: ${outPath}`));
  console.log(color.dim(`  Serve it with any static host, e.g.  npx serve ${path.relative(process.cwd(), outPath)}\n`));
}

/**
 * Smoke check: the output must contain an index.html that actually carries a
 * story. Checking the inlined config rather than the file on disk is the point —
 * that is the copy the app reads.
 */
function smokeCheck(outPath: string, { expectInline }: { expectInline: boolean }) {
  const problems: string[] = [];
  const indexFile = path.join(outPath, 'index.html');
  if (!fs.existsSync(indexFile)) {
    problems.push('index.html missing');
  } else if (expectInline) {
    const parsed = readInlinedPlayerConfig(fs.readFileSync(indexFile, 'utf8'));
    if (!parsed) problems.push('index.html carries no readable inlined player config');
    else if (!(parsed.story as { id?: string })?.id) problems.push('the inlined player config has no story');
  }

  if (problems.length) fail('Smoke check failed', problems);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (!args.release && !args.story) fail('--release (preferred) or --story is required');
  if (args.release && args.story) fail('Pass either --release or --story, not both');
  if (!args.out) fail('--out is required (output directory for the bundle)');

  console.log(color.green('▸ Exporting story to a playable web bundle\n'));

  if (args.release) await exportFromRelease(args);
  else exportFromStoryJson(args);
}

void main();
