/**
 * Produce the artifact the suite is about to inspect: a real `.vnerelease`,
 * exported into a real static bundle.
 *
 * Both steps run the committed tools rather than reimplementing them, so a
 * regression in either shows up here as a failed setup rather than as a passing
 * test against a hand-made folder.
 *
 * The Expo web build is reused when `dist-player/` already exists — it takes
 * minutes and does not change between runs of this suite. Pass
 * `PLAYER_E2E_BUILD=1` to force a fresh one.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Playwright loads config-adjacent files as CommonJS, where `import.meta` is a
// syntax error. The suite always runs from the repo root, which is also where
// the scripts below expect to be invoked from.
const REPO_ROOT = process.cwd();

export const BUNDLE_DIR = path.join(REPO_ROOT, 'e2e/player/.bundle');
const RELEASE_FILE = path.join(REPO_ROOT, 'e2e/player/.demo.vnerelease');

/**
 * Art that reaches a story through the media library, which is what makes this
 * worth testing: from a bare story JSON it is unpublishable.
 */
const PACKAGED_MEDIA = 'assets/background/bg-museum-entrance.png';

function run(script: string, args: string[]): void {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(REPO_ROOT, script), ...args],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`${script} failed with status ${result.status}`);
}

export default function globalSetup(): void {
  fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
  fs.rmSync(RELEASE_FILE, { force: true });

  run('scripts/make-demo-release.ts', [
    '--story', 'assets/demo-story-advanced.json',
    '--media', PACKAGED_MEDIA,
    '--out', RELEASE_FILE,
  ]);

  run('scripts/export-story-web.ts', [
    '--release', RELEASE_FILE,
    '--out', BUNDLE_DIR,
    ...(process.env.PLAYER_E2E_BUILD ? ['--build'] : []),
  ]);
}
