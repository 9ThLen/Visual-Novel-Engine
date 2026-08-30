/**
 * Turn a playable web bundle into a Tauri project that can be built into a
 * desktop installer.
 *
 * This is the whole of R8 that does not need a Rust toolchain, which is why it
 * is a library rather than a section of the script: staging is checkable —
 * every file it writes can be read back and asserted — and `tauri build` is not
 * checkable anywhere without cargo installed. Keeping them apart means the part
 * that decides *what the application is* has tests, and the part that shells out
 * has none to fake.
 *
 * The input is a B1 bundle (`pnpm export:story --release …`), not a
 * `.vnerelease`. The desktop channel deliberately consumes the same folder the
 * web channel publishes: if the two read the release separately they would
 * eventually disagree about what the story is, and the disagreement would show
 * up as a desktop build that plays a different novel from the web one.
 */
import fs from 'node:fs';
import path from 'node:path';

import { prepareOutPath } from '../../tools/lib/out-path';

import {
  chooseIconSource,
  type IconCandidate,
  type IconChoice as IconChoiceType,
} from '../../tools/lib/icon-source';

import {
  deriveNativeIdentity,
  type NativeIdentity,
} from '@/lib/release/native-identity';
import { readInlinedPlayerConfig } from '@/lib/release/player-bundle';

/**
 * The template's own values. Exported so the verifier and the tests name the
 * same strings the template file does — a staged project that still carries one
 * of these is one where a substitution silently did nothing.
 */
export const TEMPLATE_IDENTIFIER = 'com.vne.story.template.s0';
export const TEMPLATE_PRODUCT_NAME = 'Visual Novel Player';
export const TEMPLATE_VERSION = '0.0.0';

/** Where the bundle goes inside the staged project, relative to `src-tauri`. */
export const FRONTEND_DIR_NAME = 'frontend';

export interface BundleRelease {
  storyId: string;
  title: string;
  version: string;
  releaseId: string;
}

/**
 * What the bundle says it is.
 *
 * Read from the config inlined in `index.html` rather than from a manifest
 * beside it, because that inlined copy is the one the application will actually
 * boot from. A staged project named after a release that the page does not
 * carry would install as an update to the wrong version.
 */
export function readBundleRelease(bundleDir: string): BundleRelease {
  const indexFile = path.join(bundleDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`No index.html in ${bundleDir} — that is not an exported bundle.`);
  }
  const config = readInlinedPlayerConfig(fs.readFileSync(indexFile, 'utf8'));
  if (!config) {
    throw new Error(
      `${indexFile} carries no player config. Export it with `
      + '"pnpm export:story --release <file.vnerelease> --out <dir>" first.',
    );
  }

  const story = config.story as { id?: unknown; title?: unknown } | null;
  if (!story || typeof story.id !== 'string' || !story.id) {
    throw new Error('The bundle\'s player config has no story id.');
  }
  if (!config.release || typeof config.release.version !== 'string') {
    // The legacy `--story` export path produces a bundle with no release block.
    // A desktop application without a version cannot be updated: the installer
    // has nothing to compare, so every build looks like a reinstall.
    throw new Error(
      'This bundle was exported from a story JSON, so it has no release version. '
      + 'A desktop build needs one — export from a .vnerelease instead.',
    );
  }

  return {
    storyId: story.id,
    title: typeof story.title === 'string' ? story.title : '',
    version: config.release.version,
    releaseId: config.release.releaseId,
  };
}

export interface StageDesktopInput {
  /** An exported player bundle: the directory containing `index.html`. */
  bundleDir: string;
  /** Where the staged Tauri project goes. Emptied first. */
  outDir: string;
  /** `tools/desktop-shell`. */
  templateDir: string;
  /** Bundle targets, e.g. `['nsis']`. Empty means the template's default. */
  targets?: string[];
  /** Overrides the identity derived from the bundle. Tests use it. */
  identity?: NativeIdentity;
  repoRoot: string;
  cwd?: string;
}

export interface StagedDesktopProject {
  outDir: string;
  srcTauriDir: string;
  frontendDir: string;
  configFile: string;
  identity: NativeIdentity;
  release: BundleRelease;
  targets: string[];
  frontendFileCount: number;
  frontendBytes: number;
  /** False until `tauri icon` has run; the build path refuses without it. */
  iconsGenerated: boolean;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Copy the template, put the bundle beside it and write the identity into the
 * config. Nothing here runs a toolchain, so it works on a machine with no Rust
 * at all — which is what makes it testable.
 */
export function stageDesktopProject(input: StageDesktopInput): StagedDesktopProject {
  const bundleDir = path.resolve(input.bundleDir);
  const outDir = path.resolve(input.outDir);
  const templateDir = path.resolve(input.templateDir);

  if (!fs.existsSync(path.join(templateDir, 'src-tauri', 'tauri.conf.json'))) {
    throw new Error(`No desktop template at ${templateDir}`);
  }
  if (outDir === bundleDir) {
    throw new Error('The staged project must not be the bundle directory: it is emptied first.');
  }
  // Everything that can refuse happens before anything is emptied: a bundle with
  // no release must not cost the author the directory they pointed at.
  const release = readBundleRelease(bundleDir);
  const identity = input.identity ?? deriveNativeIdentity({
    storyId: release.storyId,
    title: release.title,
    version: release.version,
  });

  prepareOutPath(outDir, { repoRoot: input.repoRoot, cwd: input.cwd });
  fs.cpSync(templateDir, outDir, { recursive: true });

  const frontendDir = path.join(outDir, FRONTEND_DIR_NAME);
  fs.cpSync(bundleDir, frontendDir, { recursive: true });

  const srcTauriDir = path.join(outDir, 'src-tauri');
  const configFile = path.join(srcTauriDir, 'tauri.conf.json');
  const targets = input.targets && input.targets.length > 0 ? [...input.targets] : undefined;
  writeTauriConfig(configFile, identity, targets);
  writeCargoVersion(path.join(srcTauriDir, 'Cargo.toml'), identity.version);

  const frontendFiles = listFiles(frontendDir);
  return {
    outDir,
    srcTauriDir,
    frontendDir,
    configFile,
    identity,
    release,
    targets: readTauriConfig(configFile).bundle.targets,
    frontendFileCount: frontendFiles.length,
    frontendBytes: frontendFiles.reduce((total, file) => total + fs.statSync(file).size, 0),
    iconsGenerated: hasGeneratedIcons(srcTauriDir),
  };
}

interface TauriConfig {
  productName: string;
  version: string;
  identifier: string;
  build: { frontendDist: string };
  app: { windows: { title: string }[] };
  bundle: { targets: string[]; icon: string[] };
}

function readTauriConfig(configFile: string): TauriConfig {
  return JSON.parse(fs.readFileSync(configFile, 'utf8')) as TauriConfig;
}

/**
 * Parsed and re-serialized rather than text-substituted.
 *
 * A placeholder swap that misses leaves a project that builds happily under the
 * template's own name — the failure is a correctly signed installer for the
 * wrong application. Setting keys on parsed JSON cannot half-apply.
 */
function writeTauriConfig(configFile: string, identity: NativeIdentity, targets?: string[]): void {
  const config = readTauriConfig(configFile);
  config.productName = identity.productName;
  config.version = identity.version;
  config.identifier = identity.applicationId;
  for (const window of config.app.windows) window.title = identity.productName;
  if (targets) config.bundle.targets = targets;
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
}

function writeCargoVersion(cargoFile: string, version: string): void {
  const source = fs.readFileSync(cargoFile, 'utf8');
  const replaced = source.replace(`version = "${TEMPLATE_VERSION}"`, `version = "${version}"`);
  if (replaced === source && version !== TEMPLATE_VERSION) {
    throw new Error(`Could not set the crate version in ${cargoFile}`);
  }
  fs.writeFileSync(cargoFile, replaced);
}

/** The icon set `tauri icon` produces. Windows needs the `.ico` specifically. */
export const REQUIRED_ICON_FILES = ['icons/icon.ico', 'icons/32x32.png', 'icons/128x128.png'];

export function hasGeneratedIcons(srcTauriDir: string): boolean {
  return REQUIRED_ICON_FILES.every((file) => fs.existsSync(path.join(srcTauriDir, file)));
}

/**
 * Read the staged project back and check it is what it claims to be.
 *
 * A separate pass over the files on disk, not a set of assertions inside the
 * writer: R7 made verification its own state for the same reason. A build that
 * produced something unusable has to be distinguishable from one that produced
 * nothing, and the only way to tell is to look at the result rather than at the
 * intention.
 */
export function verifyStagedProject(outDir: string): string[] {
  const problems: string[] = [];
  const srcTauriDir = path.join(outDir, 'src-tauri');
  const configFile = path.join(srcTauriDir, 'tauri.conf.json');

  if (!fs.existsSync(configFile)) return [`No tauri.conf.json in ${srcTauriDir}`];

  let config: TauriConfig;
  try {
    config = readTauriConfig(configFile);
  } catch (error) {
    return [`tauri.conf.json is not readable JSON: ${(error as Error).message}`];
  }

  if (config.identifier === TEMPLATE_IDENTIFIER) {
    problems.push('The identifier is still the template\'s — the story would install over any other.');
  }
  if (config.productName === TEMPLATE_PRODUCT_NAME) {
    problems.push('The product name is still the template\'s.');
  }
  if (config.version === TEMPLATE_VERSION) {
    problems.push('The version is still the template\'s, so no installer could tell two builds apart.');
  }

  // `frontendDist` is relative to the config file, and Tauri reports a missing
  // one only once the whole Rust build has finished.
  const frontendDir = path.resolve(srcTauriDir, config.build.frontendDist);
  const indexFile = path.join(frontendDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    problems.push(`frontendDist "${config.build.frontendDist}" has no index.html.`);
  } else {
    const boot = readInlinedPlayerConfig(fs.readFileSync(indexFile, 'utf8'));
    if (!boot) problems.push('The staged index.html carries no player config: it would open empty.');
    else if (!(boot.story as { id?: string } | null)?.id) {
      problems.push('The staged player config carries no story.');
    }
  }

  for (const required of ['Cargo.toml', 'build.rs', path.join('src', 'main.rs')]) {
    if (!fs.existsSync(path.join(srcTauriDir, required))) {
      problems.push(`The staged project has no src-tauri/${required.split(path.sep).join('/')}.`);
    }
  }

  return problems;
}

// ── Icons ─────────────────────────────────────────────────────────────────

export { MIN_ICON_SIZE, readPngSize, type IconChoice, type PngSize } from '../../tools/lib/icon-source';

export interface PickIconSourceInput {
  bundleDir: string;
  /** The engine's own icon, used when the story has nothing usable. */
  fallbackIcon: string;
  /** An explicit `--icon`. Checked like any other candidate. */
  override?: string;
  /** The bundle's inlined boot config. */
  story?: { thumbnailUri?: unknown } | null;
  assets?: Record<string, string>;
}

/**
 * The novel's cover, when it can be an application icon; the engine's icon
 * otherwise. The rule itself lives in `tools/lib/icon-source.ts`, shared with
 * the Android channel so the two cannot disagree about the same file.
 */
export function pickIconSource(input: PickIconSourceInput): IconChoiceType {
  const candidates: IconCandidate[] = [];
  if (input.override) {
    candidates.push({ file: path.resolve(input.override), label: 'the icon you passed' });
  } else {
    const cover = input.story?.thumbnailUri;
    const mapped = typeof cover === 'string' ? input.assets?.[cover] : undefined;
    if (mapped) {
      candidates.push({ file: path.join(input.bundleDir, mapped), label: 'the story cover' });
    }
  }
  return chooseIconSource(candidates, input.fallbackIcon);
}
