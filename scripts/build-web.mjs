/**
 * The production web build.
 *
 * Two builds, not one. `dist/` is the studio — the app an author opens. Inside
 * it sits `player-shell-<version>.zip`: the *player* build, zipped, which the
 * studio downloads at export time and turns into a playable folder for one
 * story (see `lib/release/shell-build.ts`).
 *
 * The shell has to be prebuilt because the studio cannot run a bundler. An
 * author with nothing but a browser still has to be able to hand a stranger a
 * folder that plays, and this is the only way the browser can produce one: take
 * a shell someone already compiled and inject the story into it.
 *
 * The descriptor beside it (`player-shell.json`) exists so the app never has to
 * guess a filename, and so it can refuse a shell built by a different engine
 * version before spending a download on it.
 *
 * The shell carries the app and nothing else. `assets/assets/` — the project's
 * own art, every demo background and sample track, 110 MB of it — is left out:
 * a release packages the media its own story uses, including anything bundled,
 * so a player built for one novel has no use for the others' art. Shipping it
 * would have made an author download 116 MB to export a story that needed six.
 *
 * `assets/node_modules/` stays. It is 400 kB of icon fonts and navigation
 * glyphs the app itself draws with — nothing to do with any story, and a shell
 * without them renders a reader whose menu button is an empty square. An
 * earlier cut of this excluded all of `assets/` and did exactly that.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { hardenWebOutput } from './lib/harden-web-output.mjs';
import { inlineBundleFonts } from './lib/inline-bundle-fonts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where the studio looks for the shell. Mirrored by `lib/release/shell.ts`. */
const SHELL_DESCRIPTOR = 'player-shell.json';
const PLAYER_DIST = 'dist-player';
const STUDIO_DIST = 'dist';

function expoExport({ outputDir, profile }) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'node_modules', 'expo', 'bin', 'cli'),
      'export', '--platform', 'web', '--output-dir', outputDir,
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        // The shell is relative to itself: a bundle built from it must play from
        // a sub-path, from a static host's root, and from a double-clicked
        // `index.html`. Absolute `/_expo/…` paths manage only the middle one.
        ...(profile === 'player' ? { VNE_PROFILE: 'player', VNE_WEB_BASE_URL: '.' } : {}),
      },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function appVersion() {
  const config = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'node_modules', 'expo', 'bin', 'cli'), 'config', '--type', 'public', '--json'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (config.status !== 0) {
    console.error(config.stderr ?? '');
    process.exit(config.status ?? 1);
  }
  // The CLI prints env notices before the JSON; take the object, not the noise.
  const start = config.stdout.indexOf('{');
  return JSON.parse(config.stdout.slice(start)).version ?? '0.0.0';
}

/** Left out of the shell; see the note at the top of this file. */
const SHELL_EXCLUDED_PREFIXES = ['assets/assets/'];

function collectFiles(dir, base = dir) {
  const files = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, collectFiles(full, base));
      continue;
    }
    const name = path.relative(base, full).split(path.sep).join('/');
    if (SHELL_EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    files[name] = fs.readFileSync(full);
  }
  return files;
}

function buildPlayerShell(version) {
  const playerDist = path.join(repoRoot, PLAYER_DIST);
  expoExport({ outputDir: PLAYER_DIST, profile: 'player' });
  // See `hardenWebOutput`: a player bundle carries the frame guard but no CSP,
  // because `default-src 'self'` is unsatisfiable from a `file://` page.
  hardenWebOutput(playerDist, { csp: false, fileProtocol: true });
  inlineBundleFonts(playerDist);

  const files = collectFiles(playerDist);
  const entryCount = Object.keys(files).length;
  // Compressed, because with the art excluded what is left is almost entirely
  // JavaScript — the one thing in a web build that deflates well, and the
  // author pays for every byte of it on a connection they did not choose.
  const zipped = zipSync(files, { level: 6 });

  const fileName = `player-shell-${version}.zip`;
  const target = path.join(repoRoot, STUDIO_DIST, fileName);
  fs.writeFileSync(target, zipped);

  const descriptor = {
    version,
    file: fileName,
    bytes: zipped.byteLength,
    sha256: createHash('sha256').update(zipped).digest('hex'),
    entries: entryCount,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(repoRoot, STUDIO_DIST, SHELL_DESCRIPTOR),
    JSON.stringify(descriptor, null, 2),
  );

  return descriptor;
}

expoExport({ outputDir: STUDIO_DIST });
hardenWebOutput(path.join(repoRoot, STUDIO_DIST));
console.log('Applied production CSP and clickjacking guard to dist/index.html');

const version = appVersion();
const shell = buildPlayerShell(version);
console.log(
  `Player shell v${shell.version}: ${shell.file} — ` +
  `${shell.entries} files, ${(shell.bytes / (1024 * 1024)).toFixed(1)} MB`,
);
