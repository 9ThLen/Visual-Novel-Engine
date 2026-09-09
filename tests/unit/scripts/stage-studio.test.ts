/**
 * Turning the studio's web build into a buildable Tauri project.
 *
 * The player's staging test guards against a placeholder that survived. This one
 * guards the opposite failure: an identity that *changed*. `com.vne.studio` is
 * where Windows keeps every project an author has written, so a release that
 * ships under a different identifier opens an empty studio on a machine full of
 * work — and leaves the old folder on disk, unreachable, which looks exactly
 * like data loss to the person it happens to.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FRONTEND_DIR_NAME,
  STUDIO_IDENTIFIER,
  STUDIO_PRODUCT_NAME,
  TEMPLATE_VERSION,
  assertPlayerShell,
  assertStudioBundle,
  stageStudioProject,
  verifyStagedStudioProject,
} from '../../../scripts/lib/stage-studio';
import { inlinePlayerConfig, type PlayerBootConfig } from '@/lib/release/player-bundle';
import { PLAYER_SHELL_DESCRIPTOR_PATH } from '@/lib/release/shell';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'tools', 'studio-shell');
const SRC_TAURI = path.join(TEMPLATE_DIR, 'src-tauri');

const SHELL_HTML = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';

function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `vne-${name}-`));
}

/**
 * The player shell `pnpm build:web` leaves inside the studio build.
 *
 * Written with a real digest because the check recomputes one: the failure this
 * guards against is a zip that arrived truncated, and a fake hash would let the
 * test pass on a bundle the app would reject after downloading it.
 */
function writeShell(dir: string, version: string, corrupt = false): void {
  const bytes = new TextEncoder().encode(`player shell for ${version}`);
  const file = `player-shell-${version}.zip`;
  fs.writeFileSync(path.join(dir, file), corrupt ? new Uint8Array([...bytes, 120]) : bytes);
  fs.writeFileSync(path.join(dir, PLAYER_SHELL_DESCRIPTOR_PATH), JSON.stringify({
    version,
    file,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    entries: 12,
  }));
}

/** The studio build the way `pnpm build:web` writes one, minus the real bundle. */
function writeStudioBundle(dir: string, version = '1.4.0'): string {
  fs.mkdirSync(path.join(dir, '_expo', 'static', 'js', 'web'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_expo', 'static', 'js', 'web', 'entry.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dir, 'index.html'), SHELL_HTML);
  writeShell(dir, version);
  return dir;
}

function playerBootConfig(): PlayerBootConfig {
  return {
    version: 1,
    generatedAt: '2026-09-09T00:00:00.000Z',
    story: {
      id: 'story_42',
      title: 'Rain: A Novel',
      startSceneId: 'scene_1',
      scenes: { scene_1: { id: 'scene_1', timeline: [] } },
    },
    release: { releaseId: 'release_1', version: '2.1.0', releasedAt: '2026-09-09T00:00:00.000Z' },
  };
}

/** An exported novel: the one thing that must never be staged as the studio. */
function writePlayerBundle(dir: string): string {
  writeStudioBundle(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), inlinePlayerConfig(SHELL_HTML, playerBootConfig()));
  return dir;
}

function stage(bundleDir: string, outDir: string, version = '1.4.0') {
  return stageStudioProject({
    bundleDir,
    outDir,
    templateDir: TEMPLATE_DIR,
    version,
    repoRoot: REPO_ROOT,
    cwd: REPO_ROOT,
  });
}

function readConfig(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as {
    identifier: string;
    productName: string;
    version: string;
    bundle: { targets: string[] };
  };
}

// ── The identity ────────────────────────────────────────────────────────────

describe('the studio identity is permanent', () => {
  /**
   * This test has no other purpose than to fail when someone edits the constant.
   * If it is failing, the question is not how to make it pass: it is whether
   * every existing installation is meant to lose sight of its projects.
   */
  it('is the string every previous installer used', () => {
    expect(STUDIO_IDENTIFIER).toBe('com.vne.studio');
    expect(STUDIO_PRODUCT_NAME).toBe('Visual Novel Studio');
  });

  it('is stated once, in the template the build reads', () => {
    const config = readConfig(path.join(SRC_TAURI, 'tauri.conf.json'));
    expect(config.identifier).toBe(STUDIO_IDENTIFIER);
    expect(config.productName).toBe(STUDIO_PRODUCT_NAME);
  });

  it('is not the player shell, which is a different application', () => {
    const player = readConfig(path.join(REPO_ROOT, 'tools', 'desktop-shell', 'src-tauri', 'tauri.conf.json'));
    expect(player.identifier).not.toBe(STUDIO_IDENTIFIER);
  });
});

describe('the studio window exposes nothing it does not need', () => {
  it('grants core permissions only', () => {
    const capability = JSON.parse(
      fs.readFileSync(path.join(SRC_TAURI, 'capabilities', 'default.json'), 'utf8'),
    ) as { permissions: string[] };
    expect(capability.permissions).toEqual(['core:default']);
  });

  it('registers no commands', () => {
    const main = fs.readFileSync(path.join(SRC_TAURI, 'src', 'main.rs'), 'utf8');
    expect(main).not.toContain('invoke_handler');
  });
});

// ── What may be staged ──────────────────────────────────────────────────────

describe('recognising the studio build', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('accepts the web build', () => {
    dir = writeStudioBundle(tempDir('studio'));
    expect(() => assertStudioBundle(dir)).not.toThrow();
  });

  it('refuses a directory that is not a web build', () => {
    dir = tempDir('empty');
    expect(() => assertStudioBundle(dir)).toThrow('not a web build');
  });

  it('refuses an exported story, which would install over the author\'s studio', () => {
    dir = writePlayerBundle(tempDir('player'));
    expect(() => assertStudioBundle(dir)).toThrow('exported story');
  });

  it('refuses a bundle with no Expo output', () => {
    dir = tempDir('nobundle');
    fs.writeFileSync(path.join(dir, 'index.html'), SHELL_HTML);
    expect(() => assertStudioBundle(dir)).toThrow('_expo');
  });
});

// ── The player shell ────────────────────────────────────────────────────────

/**
 * The studio has no bundler: it exports a playable release by injecting the
 * story into a prebuilt player shell it ships inside itself. A build without one
 * installs, opens and edits perfectly, and fails at the step the application
 * exists for — which is how the first installer built by this script shipped.
 */
describe('the shipped player shell', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('accepts the shell that build:web leaves behind', () => {
    dir = writeStudioBundle(tempDir('studio'), '1.4.0');
    expect(() => assertPlayerShell(dir, '1.4.0')).not.toThrow();
  });

  it('refuses a bare expo export, which looks complete and is not', () => {
    dir = tempDir('bare');
    fs.mkdirSync(path.join(dir, '_expo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), SHELL_HTML);

    expect(() => assertStudioBundle(dir)).not.toThrow();
    expect(() => assertPlayerShell(dir, '1.4.0')).toThrow('could not export a playable release');
  });

  it('refuses a shell the app would reject for its version', () => {
    dir = writeStudioBundle(tempDir('studio'), '1.3.0');
    expect(() => assertPlayerShell(dir, '1.4.0')).toThrow('would refuse it');
  });

  it('refuses a descriptor whose zip is not beside it', () => {
    dir = writeStudioBundle(tempDir('studio'), '1.4.0');
    fs.rmSync(path.join(dir, 'player-shell-1.4.0.zip'));
    expect(() => assertPlayerShell(dir, '1.4.0')).toThrow('not beside it');
  });

  it('refuses a shell that does not match its own digest', () => {
    dir = tempDir('studio');
    fs.mkdirSync(path.join(dir, '_expo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), SHELL_HTML);
    writeShell(dir, '1.4.0', true);
    expect(() => assertPlayerShell(dir, '1.4.0')).toThrow(/bytes, but the descriptor says/);
  });
});

// ── Staging ─────────────────────────────────────────────────────────────────

describe('staging the studio', () => {
  let bundle: string;
  let out: string;
  afterEach(() => {
    fs.rmSync(bundle, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('writes the version and keeps the identity', () => {
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');

    const staged = stage(bundle, out, '1.4.0');

    const config = readConfig(staged.configFile);
    expect(config.identifier).toBe(STUDIO_IDENTIFIER);
    expect(config.productName).toBe(STUDIO_PRODUCT_NAME);
    expect(config.version).toBe('1.4.0');
    expect(fs.readFileSync(path.join(staged.srcTauriDir, 'Cargo.toml'), 'utf8'))
      .toContain('version = "1.4.0"');
  });

  it('puts the build where the config says the frontend is', () => {
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');

    const staged = stage(bundle, out);

    expect(staged.frontendDir).toBe(path.join(out, FRONTEND_DIR_NAME));
    expect(fs.existsSync(path.join(staged.frontendDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(staged.frontendDir, '_expo'))).toBe(true);
    // index.html, the Expo entry, the player shell and its descriptor.
    expect(staged.frontendFileCount).toBe(4);
    expect(fs.existsSync(path.join(staged.frontendDir, PLAYER_SHELL_DESCRIPTOR_PATH))).toBe(true);
    expect(staged.frontendBytes).toBeGreaterThan(0);
  });

  it('refuses a version no installer could compare', () => {
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');

    expect(() => stage(bundle, out, TEMPLATE_VERSION)).toThrow('tell two builds apart');
    expect(() => stage(bundle, out, '1.4')).toThrow('1.2.3');
  });

  it('refuses the wrong bundle before emptying the output directory', () => {
    bundle = writePlayerBundle(tempDir('player'));
    out = tempDir('out');
    fs.writeFileSync(path.join(out, 'keep.txt'), 'not mine to delete');

    expect(() => stage(bundle, out)).toThrow('exported story');
    expect(fs.readFileSync(path.join(out, 'keep.txt'), 'utf8')).toBe('not mine to delete');
  });
});

// ── Verification ────────────────────────────────────────────────────────────

describe('reading the staged project back', () => {
  let bundle: string;
  let out: string;
  afterEach(() => {
    fs.rmSync(bundle, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  });

  function stagedProject() {
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');
    return stage(bundle, out);
  }

  it('finds nothing wrong with a project it just staged', () => {
    const staged = stagedProject();
    expect(verifyStagedStudioProject(staged.outDir)).toEqual([]);
  });

  it('catches an identifier that would orphan the author\'s projects', () => {
    const staged = stagedProject();
    const config = JSON.parse(fs.readFileSync(staged.configFile, 'utf8'));
    config.identifier = 'com.vne.studio.nightly';
    fs.writeFileSync(staged.configFile, JSON.stringify(config, null, 2));

    expect(verifyStagedStudioProject(staged.outDir).join('\n')).toContain('open an empty studio');
  });

  it('catches a story staged as the studio', () => {
    const staged = stagedProject();
    fs.writeFileSync(
      path.join(staged.frontendDir, 'index.html'),
      inlinePlayerConfig(SHELL_HTML, playerBootConfig()),
    );

    expect(verifyStagedStudioProject(staged.outDir).join('\n')).toContain('this is a story, not the studio');
  });

  it('catches a staged bundle that could not export a release', () => {
    const staged = stagedProject();
    fs.rmSync(path.join(staged.frontendDir, PLAYER_SHELL_DESCRIPTOR_PATH));

    expect(verifyStagedStudioProject(staged.outDir).join('\n'))
      .toContain('could not export a playable release');
  });

  it('catches a frontend that would open blank', () => {
    const staged = stagedProject();
    fs.rmSync(path.join(staged.frontendDir, '_expo'), { recursive: true, force: true });

    expect(verifyStagedStudioProject(staged.outDir).join('\n')).toContain('would open blank');
  });

  it('catches a project the Rust build could not read', () => {
    const staged = stagedProject();
    fs.rmSync(path.join(staged.srcTauriDir, 'src', 'main.rs'));

    expect(verifyStagedStudioProject(staged.outDir).join('\n')).toContain('src-tauri/src/main.rs');
  });

  it('reports the directory rather than guessing when there is no project', () => {
    bundle = writeStudioBundle(tempDir('studio'));
    out = tempDir('out');
    expect(verifyStagedStudioProject(out)).toEqual([`No tauri.conf.json in ${path.join(out, 'src-tauri')}`]);
  });
});
