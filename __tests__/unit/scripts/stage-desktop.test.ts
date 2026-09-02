/**
 * Turning a published web bundle into a buildable Tauri project.
 *
 * Everything here runs on a machine with no Rust, which is the reason staging is
 * a library at all: `tauri build` cannot be exercised without a toolchain, but
 * every decision made *before* it — what the application is called, what it
 * contains, whether the page it opens carries a story — can be, and those are
 * the decisions that produce a correctly built installer for the wrong thing.
 */
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FRONTEND_DIR_NAME,
  TEMPLATE_IDENTIFIER,
  TEMPLATE_PRODUCT_NAME,
  TEMPLATE_VERSION,
  pickIconSource,
  readBundleRelease,
  readPngSize,
  stageDesktopProject,
  verifyStagedProject,
} from '../../../scripts/lib/stage-desktop';
import { OUTPUT_MARKER } from '../../../tools/lib/out-path';
import { deriveApplicationId } from '@/lib/release/native-identity';
import { inlinePlayerConfig, type PlayerBootConfig } from '@/lib/release/player-bundle';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'tools', 'desktop-shell');

const SHELL_HTML = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';

function bootConfig(overrides: Partial<PlayerBootConfig> = {}): PlayerBootConfig {
  return {
    version: 1,
    generatedAt: '2026-08-30T00:00:00.000Z',
    story: {
      id: 'story_42',
      title: 'Rain: A Novel',
      startSceneId: 'scene_1',
      scenes: { scene_1: { id: 'scene_1', timeline: [] } },
    },
    release: { releaseId: 'release_1', version: '2.1.0', releasedAt: '2026-08-30T00:00:00.000Z' },
    ...overrides,
  };
}

/** A bundle the way `pnpm export:story` writes one, minus the Expo output. */
function writeBundle(dir: string, config: PlayerBootConfig | null = bootConfig()): string {
  fs.mkdirSync(path.join(dir, '_expo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_expo', 'app.js'), 'console.log(1)');
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    config ? inlinePlayerConfig(SHELL_HTML, config) : SHELL_HTML,
  );
  return dir;
}

function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `vne-${name}-`));
}

// ── A genuinely valid PNG, so the header reader is reading a real one ────────

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  body.set(new TextEncoder().encode(type), 0);
  body.set(data, 4);
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}

/** 8-bit greyscale, every pixel zero. Small once deflated, and really a PNG. */
function writePng(file: string, width: number, height: number): string {
  const ihdrData = new Uint8Array(13);
  const ihdr = new DataView(ihdrData.buffer);
  ihdr.setUint32(0, width);
  ihdr.setUint32(4, height);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 0; // colour type: greyscale
  const raw = new Uint8Array((width + 1) * height); // filter byte + row, all zero
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdrData),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { png.set(part, offset); offset += part.length; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  return file;
}

describe('reading what a bundle is', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('takes the story and the release from the config the page will boot from', () => {
    dir = writeBundle(tempDir('bundle'));
    expect(readBundleRelease(dir)).toEqual({
      storyId: 'story_42',
      title: 'Rain: A Novel',
      version: '2.1.0',
      releaseId: 'release_1',
    });
  });

  it('refuses a directory that is not an exported bundle', () => {
    dir = tempDir('empty');
    expect(() => readBundleRelease(dir)).toThrow('not an exported bundle');
  });

  it('refuses a page carrying no config, which would open on an empty screen', () => {
    dir = writeBundle(tempDir('bundle'), null);
    expect(() => readBundleRelease(dir)).toThrow('carries no player config');
  });

  /**
   * The legacy `--story` export has no release block. An application without a
   * version cannot be updated: every installer run looks like a first install.
   */
  it('refuses a bundle exported from a story JSON', () => {
    dir = writeBundle(tempDir('bundle'), { ...bootConfig(), release: undefined } as never);
    expect(() => readBundleRelease(dir)).toThrow('no release version');
  });

  it('refuses a config that the player runtime cannot boot', () => {
    dir = writeBundle(tempDir('bundle'), bootConfig({
      story: { id: 'story_42', title: 'Rain: A Novel', scenes: {} },
    }));
    expect(() => readBundleRelease(dir)).toThrow('carries no player config');
  });
});

describe('staging a desktop project', () => {
  let bundle: string;
  let out: string;

  beforeEach(() => {
    bundle = writeBundle(tempDir('bundle'));
    out = path.join(tempDir('staged'), 'project');
  });
  afterEach(() => {
    for (const dir of [bundle, path.dirname(out)]) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes a project carrying the story identity, and nothing of the template', () => {
    const staged = stageDesktopProject({
      bundleDir: bundle, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    });

    const config = JSON.parse(fs.readFileSync(staged.configFile, 'utf8'));
    expect(config.identifier).toBe(deriveApplicationId('story_42'));
    expect(config.productName).toBe('Rain A Novel');
    expect(config.version).toBe('2.1.0');
    // The window title is what a reader sees in the task bar, and it is easy to
    // leave behind: it lives under `app.windows`, not beside `productName`.
    expect(config.app.windows[0].title).toBe('Rain A Novel');
    expect(fs.readFileSync(path.join(staged.srcTauriDir, 'Cargo.toml'), 'utf8'))
      .toContain('version = "2.1.0"');
  });

  it('puts the bundle where the config says the frontend is', () => {
    const staged = stageDesktopProject({
      bundleDir: bundle, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    });
    const config = JSON.parse(fs.readFileSync(staged.configFile, 'utf8'));
    const frontend = path.resolve(staged.srcTauriDir, config.build.frontendDist);

    expect(frontend).toBe(path.join(staged.outDir, FRONTEND_DIR_NAME));
    expect(fs.existsSync(path.join(frontend, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(frontend, '_expo', 'app.js'))).toBe(true);
    expect(staged.frontendFileCount).toBe(2);
    expect(staged.frontendBytes).toBeGreaterThan(0);
  });

  it('carries the Rust side over', () => {
    const staged = stageDesktopProject({
      bundleDir: bundle, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    });
    for (const file of ['Cargo.toml', 'build.rs', 'src/main.rs', 'capabilities/default.json']) {
      expect(fs.existsSync(path.join(staged.srcTauriDir, ...file.split('/'))), file).toBe(true);
    }
  });

  /**
   * The staged directory is emptied first. A media file left from the previous
   * story would otherwise ship inside this one's installer — the author would
   * never see it, because their build looks fine.
   */
  it('does not carry anything over from a previous story', () => {
    const previous = stageDesktopProject({
      bundleDir: bundle, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    });
    fs.mkdirSync(path.join(previous.frontendDir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(previous.frontendDir, 'media', 'from-another-novel.png'), 'x');

    const staged = stageDesktopProject({
      bundleDir: bundle, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    });
    expect(fs.existsSync(path.join(staged.frontendDir, 'media', 'from-another-novel.png'))).toBe(false);
  });

  /**
   * The guard this originally got wrong.
   *
   * It refused a filesystem root, the repository, the current directory and
   * anything containing either — which catches `--out .` and nothing else.
   * `--out ./assets` went straight through and deleted the art. Naming a path is
   * not consenting to lose what is in it.
   */
  it('refuses a directory holding files it did not write', () => {
    const source = path.join(path.dirname(out), 'assets');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'keep.png'), 'irreplaceable');

    expect(() => stageDesktopProject({
      bundleDir: bundle, outDir: source, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    })).toThrow('without a valid build marker');
    expect(fs.existsSync(path.join(source, 'keep.png'))).toBe(true);
  });

  it('accepts an empty directory, and one it wrote before', () => {
    const empty = path.join(path.dirname(out), 'empty');
    fs.mkdirSync(empty, { recursive: true });
    const first = stageDesktopProject({
      bundleDir: bundle, outDir: empty, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    });
    expect(fs.existsSync(path.join(first.outDir, OUTPUT_MARKER))).toBe(true);

    // The marker is what makes a re-run safe without asking again.
    expect(() => stageDesktopProject({
      bundleDir: bundle, outDir: empty, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    })).not.toThrow();
  });

  it('writes the targets it was given, and keeps the template default otherwise', () => {
    const chosen = stageDesktopProject({
      bundleDir: bundle, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
      targets: ['deb', 'appimage'],
    });
    expect(chosen.targets).toEqual(['deb', 'appimage']);

    const defaulted = stageDesktopProject({
      bundleDir: bundle, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT, targets: [],
    });
    expect(defaulted.targets).toEqual(['nsis']);
  });

  /** The staged directory is emptied, so the argument that names it is guarded. */
  it('refuses an output directory it must not empty', () => {
    for (const outDir of [REPO_ROOT, path.dirname(REPO_ROOT)]) {
      expect(() => stageDesktopProject({
        bundleDir: bundle, outDir, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
      }), outDir).toThrow('Refusing to use');
    }
    expect(() => stageDesktopProject({
      bundleDir: bundle, outDir: bundle, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
    })).toThrow('contains input');
  });

  it('refuses a bundle with no release before it writes anything', () => {
    const storyOnly = writeBundle(tempDir('legacy'), { ...bootConfig(), release: undefined } as never);
    try {
      expect(() => stageDesktopProject({
        bundleDir: storyOnly, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT,
      })).toThrow('no release version');
      expect(fs.existsSync(out)).toBe(false);
    } finally {
      fs.rmSync(storyOnly, { recursive: true, force: true });
    }
  });
});

describe('verifying a staged project', () => {
  let bundle: string;
  let out: string;

  beforeEach(() => {
    bundle = writeBundle(tempDir('bundle'));
    out = path.join(tempDir('staged'), 'project');
    stageDesktopProject({ bundleDir: bundle, outDir: out, templateDir: TEMPLATE_DIR, repoRoot: REPO_ROOT });
  });
  afterEach(() => {
    for (const dir of [bundle, path.dirname(out)]) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('passes a project that was staged properly', () => {
    expect(verifyStagedProject(out)).toEqual([]);
  });

  /**
   * The failure this exists for: a substitution that silently did nothing
   * produces a project that builds perfectly, under the template's identity.
   * Every story built that way installs over every other one.
   */
  it('catches a template value that survived', () => {
    const configFile = path.join(out, 'src-tauri', 'tauri.conf.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    config.identifier = TEMPLATE_IDENTIFIER;
    config.productName = TEMPLATE_PRODUCT_NAME;
    config.version = TEMPLATE_VERSION;
    fs.writeFileSync(configFile, JSON.stringify(config));

    const problems = verifyStagedProject(out);
    expect(problems.join('\n')).toContain('identifier is still the template');
    expect(problems.join('\n')).toContain('product name is still the template');
    expect(problems.join('\n')).toContain('version is still the template');
  });

  /** Tauri reports this only after the entire Rust build has finished. */
  it('catches a frontendDist that points at nothing', () => {
    fs.rmSync(path.join(out, FRONTEND_DIR_NAME), { recursive: true, force: true });
    expect(verifyStagedProject(out).join('\n')).toContain('no index.html');
  });

  it('catches a staged page that would open empty', () => {
    fs.writeFileSync(path.join(out, FRONTEND_DIR_NAME, 'index.html'), SHELL_HTML);
    expect(verifyStagedProject(out).join('\n')).toContain('would open empty');
  });

  it('catches a missing Rust side', () => {
    fs.rmSync(path.join(out, 'src-tauri', 'build.rs'));
    expect(verifyStagedProject(out).join('\n')).toContain('src-tauri/build.rs');
  });

  it('says so when there is no project at all', () => {
    expect(verifyStagedProject(path.join(out, 'nowhere'))).toHaveLength(1);
  });
});

describe('choosing the application icon', () => {
  let dir: string;
  beforeEach(() => { dir = tempDir('icons'); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const fallback = '/engine/icon.png';

  it('reads a real PNG header', () => {
    const file = writePng(path.join(dir, 'square.png'), 64, 32);
    expect(readPngSize(file)).toEqual({ width: 64, height: 32 });
  });

  it('returns nothing for a file that is not a PNG', () => {
    const file = path.join(dir, 'not.png');
    fs.writeFileSync(file, 'JFIF-ish, but not a PNG at all');
    expect(readPngSize(file)).toBeNull();
    expect(readPngSize(path.join(dir, 'missing.png'))).toBeNull();
  });

  it('uses the story cover when it can be an icon', () => {
    writePng(path.join(dir, 'media', 'cover.png'), 1024, 1024);
    const choice = pickIconSource({
      bundleDir: dir,
      fallbackIcon: fallback,
      story: { thumbnailUri: 'idb-media://cover' },
      assets: { 'idb-media://cover': 'media/cover.png' },
    });
    expect(choice.file).toBe(path.join(dir, 'media', 'cover.png'));
    expect(choice.reason).toContain('story cover');
  });

  /**
   * Most covers are portrait, so most stories land here. The reason is carried
   * out with the choice: an author wondering why their installer shows the
   * engine logo should be told, not left to guess.
   */
  it('falls back with a stated reason when the cover is not square', () => {
    writePng(path.join(dir, 'media', 'cover.png'), 800, 1200);
    const choice = pickIconSource({
      bundleDir: dir,
      fallbackIcon: fallback,
      story: { thumbnailUri: 'cover' },
      assets: { cover: 'media/cover.png' },
    });
    expect(choice.file).toBe(fallback);
    expect(choice.reason).toContain('800x1200');
  });

  it('falls back when the cover is too small to shrink from', () => {
    writePng(path.join(dir, 'media', 'cover.png'), 256, 256);
    const choice = pickIconSource({
      bundleDir: dir,
      fallbackIcon: fallback,
      story: { thumbnailUri: 'cover' },
      assets: { cover: 'media/cover.png' },
    });
    expect(choice.file).toBe(fallback);
    expect(choice.reason).toContain('256px');
  });

  it('falls back when the story has no cover at all', () => {
    expect(pickIconSource({ bundleDir: dir, fallbackIcon: fallback, story: {} }).reason)
      .toContain('no cover');
  });

  it('checks an explicit icon the same way as a cover', () => {
    const good = writePng(path.join(dir, 'chosen.png'), 512, 512);
    expect(pickIconSource({ bundleDir: dir, fallbackIcon: fallback, override: good }).file).toBe(good);

    const bad = writePng(path.join(dir, 'wide.png'), 1024, 512);
    const choice = pickIconSource({ bundleDir: dir, fallbackIcon: fallback, override: bad });
    expect(choice.file).toBe(fallback);
    expect(choice.reason).toContain('icon you passed');
  });
});

/**
 * What the desktop shell is allowed to do.
 *
 * A Tauri window can be given the filesystem, a shell, an HTTP client. This one
 * is given none of it, and the two files that decide are checked here rather
 * than reviewed: a novel is data a stranger runs, and the day someone adds a
 * command "just for saving" the reader's machine becomes reachable from a story.
 */
describe('the desktop shell boundary', () => {
  const srcTauri = path.join(TEMPLATE_DIR, 'src-tauri');

  it('grants the window core permissions and nothing else', () => {
    const capability = JSON.parse(
      fs.readFileSync(path.join(srcTauri, 'capabilities', 'default.json'), 'utf8'),
    );
    expect(capability.permissions).toEqual(['core:default']);
  });

  it('registers no commands, so the page has no IPC surface to call', () => {
    const main = fs.readFileSync(path.join(srcTauri, 'src', 'main.rs'), 'utf8');
    expect(main).not.toContain('invoke_handler');
    expect(main).not.toContain('#[tauri::command]');
  });

  it('depends on Tauri and nothing else', () => {
    const cargo = fs.readFileSync(path.join(srcTauri, 'Cargo.toml'), 'utf8');
    const start = cargo.indexOf('[dependencies]') + '[dependencies]'.length;
    const rest = cargo.slice(start);
    const end = rest.indexOf('\n[');
    const section = end === -1 ? rest : rest.slice(0, end);
    const names = [...section.matchAll(/^([a-z0-9-]+)\s*=/gm)].map((match) => match[1]);
    expect(names).toEqual(['tauri']);
  });
});
