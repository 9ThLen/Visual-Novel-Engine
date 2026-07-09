// @ts-check
/**
 * Player-web exporter.
 *
 * Turns ONE story into a self-contained, playable static web bundle:
 *
 *   pnpm export:story -- --story <id-or-json-path> --out <dir>
 *
 * It (1) reuses (or runs) the Expo web build, (2) copies it to `--out`, and
 * (3) drops a `player-config.json` boot flag next to `index.html`. The generic
 * app reads that flag on load and launches straight into the reader for the
 * bundled story, with no editor UI reachable (see `lib/player-mode.ts`).
 *
 * Node builtins only — no runtime dependencies.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { collectStoryAssetRefs } from './lib/collect-story-assets.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const PLAYER_CONFIG_VERSION = 1;

const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function fail(message, details = []) {
  console.error(color.red(`\n✖ ${message}`));
  for (const line of details) console.error(color.red(`    • ${line}`));
  console.error('');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { dist: 'dist', build: false, skipBuild: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--story': args.story = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--dist': args.dist = argv[++i]; break;
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
  pnpm export:story -- --story <id-or-json-path> --out <dir> [options]

Options:
  --story <id|path>  Story id (looked up in assets/*.json) or path to a story JSON.
  --out <dir>        Output directory for the published bundle (required).
  --dist <dir>       Expo web build directory to reuse (default: dist).
  --build            Force a fresh 'expo export --platform web' even if dist exists.
  --skip-build       Never build; require an existing dist directory.
  --strict           Treat missing bundled asset references as errors, not warnings.
  -h, --help         Show this help.
`);
}

/** Resolve --story to a parsed story object, accepting a path or a story id. */
function resolveStory(storyArg) {
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validateStory(story, source) {
  const problems = [];
  if (!story || typeof story !== 'object') fail(`Story JSON is not an object: ${source}`);
  if (typeof story.id !== 'string' || !story.id.trim()) problems.push('missing "id"');
  if (typeof story.title !== 'string' || !story.title.trim()) problems.push('missing "title"');
  if (typeof story.startSceneId !== 'string' || !story.startSceneId.trim()) problems.push('missing "startSceneId"');
  if (!story.scenes || typeof story.scenes !== 'object' || Object.keys(story.scenes).length === 0) {
    problems.push('missing or empty "scenes"');
  }
  if (problems.length) fail(`Invalid story JSON (${source})`, problems);
}

/**
 * Classify the story's asset references. Device-local references (file://,
 * blob:, media-library) can never be packaged by this script and are fatal
 * immediately — no point building first. `bundled` refs are validated against
 * the actual build output later (see {@link verifyEmittedAssets}).
 */
function classifyStoryAssets(story) {
  const refs = collectStoryAssetRefs(story);
  const fatal = [];
  const bundled = [];
  let inline = 0;
  let remote = 0;

  for (const ref of refs) {
    if (ref.class === 'bundled') bundled.push(ref.uri);
    else if (ref.class === 'inline') inline += 1;
    else if (ref.class === 'remote') remote += 1;
    else fatal.push(`${ref.uri} (device-local reference — re-export the story with inlined assets)`);
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
function verifyEmittedAssets(outPath, bundledUris, { strict }) {
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
  const missing = [];
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

function ensureWebBuild(distDir, { build, skipBuild }) {
  const distPath = path.resolve(process.cwd(), distDir);
  const hasBuild = fs.existsSync(path.join(distPath, 'index.html'));

  if (hasBuild && !build) {
    console.log(color.dim(`  Reusing existing web build: ${distPath}`));
    return distPath;
  }
  if (skipBuild) {
    fail(`--skip-build set but no web build at ${distPath} (run 'expo export --platform web' first)`);
  }

  console.log('  Running: expo export --platform web');
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'node_modules', 'expo', 'bin', 'cli'), 'export', '--platform', 'web', '--output-dir', distDir],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) fail('expo export failed');
  if (!fs.existsSync(path.join(distPath, 'index.html'))) fail(`expo export produced no index.html in ${distPath}`);
  return distPath;
}

/** True when `ancestor` strictly contains `descendant` on the filesystem. */
function isAncestor(ancestor, descendant) {
  const rel = path.relative(ancestor, descendant);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * `copyBuild` empties the output directory before writing, so guard against a
 * destructive `--out`. Refuse a drive/filesystem root, the repo root, the
 * current directory, or any directory that *contains* the repo or cwd (which
 * `--out .` / `--out ..` resolve to). The bundle must go to its own folder.
 */
function assertSafeOutPath(outPath) {
  const cwd = process.cwd();
  const unsafe =
    outPath === path.parse(outPath).root ||
    outPath === REPO_ROOT ||
    outPath === cwd ||
    isAncestor(outPath, REPO_ROOT) ||
    isAncestor(outPath, cwd);
  if (unsafe) {
    fail(`Refusing to use --out "${outPath}"`, [
      'The output directory is emptied before writing, so it must be a dedicated',
      'folder — not a drive root, the repo root, the current directory, or a parent.',
      'Pass a dedicated path such as  --out ./story-dist',
    ]);
  }
}

function copyBuild(distPath, outArg) {
  const outPath = path.resolve(process.cwd(), outArg);
  if (outPath === distPath) fail('--out must differ from the build (--dist) directory');
  assertSafeOutPath(outPath);
  fs.rmSync(outPath, { recursive: true, force: true });
  fs.mkdirSync(outPath, { recursive: true });
  fs.cpSync(distPath, outPath, { recursive: true });
  return outPath;
}

function writePlayerConfig(outPath, story) {
  const config = {
    version: PLAYER_CONFIG_VERSION,
    generatedAt: new Date().toISOString(),
    story,
  };
  const file = path.join(outPath, 'player-config.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

/**
 * Smoke check: the output must contain index.html and a parseable
 * player-config that carries the story. (Referenced bundled assets are checked
 * separately by {@link verifyEmittedAssets}.)
 */
function smokeCheck(outPath) {
  const problems = [];
  if (!fs.existsSync(path.join(outPath, 'index.html'))) problems.push('index.html missing');

  const configFile = path.join(outPath, 'player-config.json');
  if (!fs.existsSync(configFile)) {
    problems.push('player-config.json missing');
  } else {
    try {
      const parsed = readJson(configFile);
      if (!parsed.story || !parsed.story.id) problems.push('player-config.json has no story');
    } catch {
      problems.push('player-config.json is not valid JSON');
    }
  }

  if (problems.length) fail('Smoke check failed', problems);
}

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (!args.story) fail('--story is required (a story id or a path to a story JSON)');
  if (!args.out) fail('--out is required (output directory for the bundle)');

  console.log(color.green('▸ Exporting story to a playable web bundle\n'));

  const { story, source } = resolveStory(args.story);
  validateStory(story, source);
  console.log(`  Story: ${color.green(story.title)} (${story.id})`);
  console.log(color.dim(`  Source: ${source}`));

  const assetSummary = classifyStoryAssets(story);
  console.log(
    `  Assets: ${assetSummary.total} referenced — ` +
    `${assetSummary.bundled.length} bundled, ${assetSummary.inline} inline, ${assetSummary.remote} remote`,
  );

  const distPath = ensureWebBuild(args.dist, args);
  const outPath = copyBuild(distPath, args.out);
  const configFile = writePlayerConfig(outPath, story);
  console.log(color.dim(`  Wrote ${path.relative(process.cwd(), configFile)}`));

  verifyEmittedAssets(outPath, assetSummary.bundled, args);
  smokeCheck(outPath);

  console.log(color.green(`\n✔ Published bundle ready: ${outPath}`));
  console.log(color.dim(`  Serve it with any static host, e.g.  npx serve ${path.relative(process.cwd(), outPath)}\n`));
}

main();
