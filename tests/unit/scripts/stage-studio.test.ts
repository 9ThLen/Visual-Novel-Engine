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
import { TAURI_IPC_ORIGINS, WEB_CSP } from '../../../scripts/lib/harden-web-output.mjs';

/** Shaped like what `pnpm build:bridge-package` writes. */
function writeBridgePackage(dir: string): string {
  fs.mkdirSync(path.join(dir, 'bridge'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node.exe'), 'MZ fake runtime');
  fs.writeFileSync(path.join(dir, 'bridge', 'cli.mjs'), 'console.log("AI BRIDGE PAIRING");');
  fs.writeFileSync(path.join(dir, 'README.txt'), 'how to run it');
  return dir;
}
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
  BRIDGE_RESOURCE_DIR,
  BRIDGE_RESOURCE_GLOB,
  assertBridgePackage,
} from '../../../scripts/lib/stage-studio';
import { inlinePlayerConfig, type PlayerBootConfig } from '@/lib/release/player-bundle';
import { PLAYER_SHELL_DESCRIPTOR_PATH } from '@/lib/release/shell';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'tools', 'studio-shell');
const SRC_TAURI = path.join(TEMPLATE_DIR, 'src-tauri');

/**
 * Shaped like what `build:web` actually writes: hardened, CSP tag and all.
 *
 * Staging relaxes that tag for the desktop window, so a fixture without one
 * exercises a path no real bundle takes.
 */
const SHELL_HTML = '<html><head><title>x</title>'
  + `<meta data-vne-web-security http-equiv="Content-Security-Policy" content="${WEB_CSP}">`
  + '</head><body><div id="root"></div></body></html>';

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
    bundle: { targets: string[]; resources?: string[] };
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

  // This used to assert that no command existed at all. Three do now, and the
  // guard that matters moved with them: not "can the window call into Rust", but
  // "can the window choose what Rust runs".
  it('registers the four AI bridge commands and nothing else', () => {
    const main = fs.readFileSync(path.join(SRC_TAURI, 'src', 'main.rs'), 'utf8');
    const handler = /generate_handler!\[([\s\S]*?)\]/.exec(main);
    expect(handler).not.toBeNull();
    const registered = handler![1]
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);
    expect(registered).toEqual([
      'bridge::ai_bridge_start',
      'bridge::ai_bridge_status',
      'bridge::ai_bridge_stop',
      'bridge::ai_bridge_save_settings',
    ]);
  });

  it('never lets the page say what to run', () => {
    // The whole security argument for spawning anything: the executable comes
    // from this application's own resource directory, and the commands take no
    // argument that could name another one.
    const bridge = fs.readFileSync(path.join(SRC_TAURI, 'src', 'bridge.rs'), 'utf8');
    const commands = [...bridge.matchAll(/#\[tauri::command\]\s*pub async fn [a-z_]+(?:<[^>]*>)?\(([^)]*)\)/g)];
    expect(commands).toHaveLength(4);
    for (const [, parameters] of commands) {
      // Written whole rather than split on commas: `State<'_, BridgeSupervisor>`
      // contains one, and a check that mis-parses its own subject proves nothing.
      // `provider` and `api_key` are values the author typed; no parameter names
      // a path or a program, which is what keeps this narrow.
      const normalized = parameters.replace(/\s+/g, ' ').trim().replace(/,$/, '');
      expect(normalized).toMatch(
        /^(app: AppHandle<R>, )?state: State<'_, BridgeSupervisor>(, provider: String, api_key: String)?$/,
      );
    }
  });

  it('takes no permission to run programs', () => {
    // `tauri-plugin-shell` would be a general capability to execute; what is
    // needed is one specific process, so it is spawned directly instead.
    // A dependency line, not the words: both files explain in prose why the
    // plugin is absent, and a check that trips over that explanation is worse
    // than none.
    const cargo = fs.readFileSync(path.join(SRC_TAURI, 'Cargo.toml'), 'utf8');
    expect(cargo).not.toMatch(/^\s*tauri-plugin-shell\s*=/m);
    const capability = JSON.parse(
      fs.readFileSync(path.join(SRC_TAURI, 'capabilities', 'default.json'), 'utf8'),
    ) as { permissions: string[] };
    expect(capability.permissions.filter(name => name.startsWith('shell:'))).toEqual([]);
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

  it('relaxes the CSP for the window, and only in the copy it staged', () => {
    // Tauri serves its IPC from http://ipc.localhost, which the web policy does
    // not allow, so IPC is refused and silently falls back to postMessage.
    // Nothing registers a command yet — the first thing that does would be the
    // first to find out.
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');

    const staged = stage(bundle, out);

    const stagedHtml = fs.readFileSync(path.join(staged.frontendDir, 'index.html'), 'utf8');
    const sourceHtml = fs.readFileSync(path.join(bundle, 'index.html'), 'utf8');
    for (const origin of TAURI_IPC_ORIGINS) {
      expect(stagedHtml).toContain(origin);
      // The bundle feeds the web channel and the player too, and neither has a
      // Tauri to talk to.
      expect(sourceHtml).not.toContain(origin);
    }
    expect(verifyStagedStudioProject(out)).toEqual([]);
  });

  it('fails verification when the staged page lost that relaxation', () => {
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');
    const staged = stage(bundle, out);

    const indexFile = path.join(staged.frontendDir, 'index.html');
    fs.writeFileSync(
      indexFile,
      fs.readFileSync(indexFile, 'utf8').replace(new RegExp(` ${TAURI_IPC_ORIGINS[0]}`, 'g'), ''),
    );

    expect(verifyStagedStudioProject(out)).toEqual([
      expect.stringContaining(TAURI_IPC_ORIGINS[0]),
    ]);
  });

  it('ships the AI bridge as a resource the installer carries', () => {
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');
    const bridgePackageDir = writeBridgePackage(tempDir('bridge'));

    const staged = stageStudioProject({
      bundleDir: bundle,
      outDir: out,
      templateDir: TEMPLATE_DIR,
      version: '1.4.0',
      bridgePackageDir,
      repoRoot: REPO_ROOT,
      cwd: REPO_ROOT,
    });

    expect(fs.existsSync(path.join(staged.srcTauriDir, BRIDGE_RESOURCE_DIR, 'node.exe'))).toBe(true);
    expect(fs.existsSync(path.join(staged.srcTauriDir, BRIDGE_RESOURCE_DIR, 'bridge', 'cli.mjs'))).toBe(true);
    const config = readConfig(path.join(staged.srcTauriDir, 'tauri.conf.json'));
    expect(config.bundle.resources).toEqual([BRIDGE_RESOURCE_GLOB]);
    expect(verifyStagedStudioProject(out)).toEqual([]);
  });

  it('stages the bridge where the installed studio looks for it', () => {
    // The two halves of this contract are written in different languages, and
    // nothing compiles them together. They disagreed: staging wrote
    // `resources/ai-bridge/` and Rust resolved `ai-bridge/`, which Tauri never
    // produces — a resource is installed under the relative path it was named
    // by, every component of it. The installer carried the bridge and the studio
    // reported it missing, and no test on either side could see the other.
    const rust = fs.readFileSync(
      path.join(REPO_ROOT, 'tools/studio-shell/src-tauri/src/bridge.rs'),
      'utf8',
    );
    const declared = /const RESOURCE_DIR: &str = "([^"]+)";/.exec(rust);

    expect(declared?.[1]).toBe(BRIDGE_RESOURCE_DIR);
  });

  it('builds without one, and does not claim to carry it', () => {
    // A build machine with no network cannot run build:bridge-package. Such a
    // studio still pairs with a bridge the author starts.
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');

    const staged = stage(bundle, out);

    expect(fs.existsSync(path.join(staged.srcTauriDir, BRIDGE_RESOURCE_DIR))).toBe(false);
    expect(readConfig(path.join(staged.srcTauriDir, 'tauri.conf.json')).bundle.resources).toBeUndefined();
    expect(verifyStagedStudioProject(out)).toEqual([]);
  });

  it('refuses a bridge folder that is not a package', () => {
    // An empty directory stages, builds and installs, and only then produces a
    // button that reports the bridge is missing from a build meant to have it.
    const empty = tempDir('bridge-empty');
    expect(() => assertBridgePackage(empty)).toThrow(/no usable node\.exe/);
    expect(() => assertBridgePackage(path.join(empty, 'absent'))).toThrow(/is missing/);

    const truncated = writeBridgePackage(tempDir('bridge-cut'));
    fs.writeFileSync(path.join(truncated, 'bridge', 'cli.mjs'), '');
    expect(() => assertBridgePackage(truncated)).toThrow(/no usable bridge\/cli\.mjs/);
  });

  it('fails verification when the declaration and the files disagree', () => {
    bundle = writeStudioBundle(tempDir('studio'));
    out = path.join(tempDir('out'), 'project');
    const staged = stageStudioProject({
      bundleDir: bundle,
      outDir: out,
      templateDir: TEMPLATE_DIR,
      version: '1.4.0',
      bridgePackageDir: writeBridgePackage(tempDir('bridge')),
      repoRoot: REPO_ROOT,
      cwd: REPO_ROOT,
    });

    fs.rmSync(path.join(staged.srcTauriDir, BRIDGE_RESOURCE_DIR), { recursive: true, force: true });

    expect(verifyStagedStudioProject(out)).toEqual([
      expect.stringContaining('would offer to start a bridge it does not carry'),
    ]);
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
