/**
 * Turn the studio's web build into a Tauri project that can be built into a
 * desktop installer.
 *
 * The sibling of `stage-desktop.ts`, and deliberately not a parameter of it. The
 * player stages one *story*: identity is derived per release, and the check that
 * matters is that no template placeholder survived. The studio stages the
 * *application*: identity is a constant, and the check that matters is that the
 * constant is still the one every previous installer used.
 *
 * Same split as R8 for the same reason — everything here runs on a machine with
 * no Rust, so what the application *is* has tests, and `tauri build` gets as
 * little code above it as possible.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { beginOutPath } from '../../tools/lib/out-path';
import { TAURI_IPC_ORIGINS, relaxCspForDesktopStudio } from './harden-web-output.mjs';

import { readInlinedPlayerConfig } from '@/lib/release/player-bundle';
import { PLAYER_SHELL_DESCRIPTOR_PATH, parsePlayerShellDescriptor } from '@/lib/release/shell';

/**
 * The studio's permanent identity.
 *
 * `STUDIO_IDENTIFIER` is the address of every project an author has written:
 * Windows keys the WebView2 user-data folder by it. Changing it does not migrate
 * the old folder and does not delete it either — the studio simply opens empty,
 * which is indistinguishable from data loss to the person it happens to.
 *
 * `tests/unit/scripts/stage-studio.test.ts` pins this string. That test has
 * no other purpose: it exists to fail when someone edits the line below it.
 */
export const STUDIO_IDENTIFIER = 'com.vne.studio';
export const STUDIO_PRODUCT_NAME = 'Visual Novel Studio';

/** The template's own version, overwritten by staging with the engine's. */
export const TEMPLATE_VERSION = '0.0.0';

/** Where the bundle goes inside the staged project, relative to `src-tauri`. */
export const FRONTEND_DIR_NAME = 'frontend';

/** What Tauri will accept, and what NSIS can compare between two installers. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export interface StageStudioInput {
  /** The studio build: the directory `pnpm build:web` writes to (`dist/`). */
  bundleDir: string;
  /** Where the staged Tauri project goes. Emptied first. */
  outDir: string;
  /** `tools/studio-shell`. */
  templateDir: string;
  /** The engine version, e.g. `1.0.0`. Written to the config and to Cargo. */
  version: string;
  /** Bundle targets, e.g. `['nsis']`. Empty means the template's default. */
  targets?: string[];
  repoRoot: string;
  cwd?: string;
}

export interface StagedStudioProject {
  outDir: string;
  srcTauriDir: string;
  frontendDir: string;
  configFile: string;
  identifier: string;
  productName: string;
  version: string;
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
 * Refuse anything that is not the studio's own web build.
 *
 * The expensive mistake is staging a *player* bundle here. It would build, it
 * would install under `com.vne.studio`, and it would replace the author's studio
 * with a single novel that owns their project storage. A player bundle is
 * recognisable without guessing: `export:story` inlines a boot config into
 * `index.html` and the studio build never carries one.
 */
export function assertStudioBundle(bundleDir: string): void {
  const indexFile = path.join(bundleDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error(
      `No index.html in ${bundleDir} — that is not a web build. `
      + 'Build the studio with "pnpm build:web" first.',
    );
  }
  const html = fs.readFileSync(indexFile, 'utf8');
  if (readInlinedPlayerConfig(html)) {
    throw new Error(
      `${indexFile} carries an inlined player config, so it is an exported story, `
      + 'not the studio. Build a desktop player with "pnpm build:desktop" instead.',
    );
  }
  if (!fs.existsSync(path.join(bundleDir, '_expo'))) {
    throw new Error(`${bundleDir} has no _expo directory — that is not an Expo web export.`);
  }
}

/**
 * Refuse a studio build that cannot export a playable release.
 *
 * The studio has no bundler. To turn a release into a folder a stranger can
 * play, it downloads a prebuilt player shell out of itself — `player-shell.json`
 * and the zip it names — and injects the story into that. A bundle without them
 * installs and runs and edits perfectly, and then fails at the one step the
 * whole application exists for, telling the author their copy "was deployed
 * without a player to build from".
 *
 * That is exactly what shipped the first time this script was run: `dist/` from
 * a bare `expo export` looks complete — index.html, `_expo/`, no player config —
 * and passes every other check here. So the shell is checked the way the app
 * checks it at runtime: parsed with the app's own parser, matched against the
 * engine version, and hashed, because a truncated zip is a build that fails on
 * the author's first export rather than on ours.
 */
export function assertPlayerShell(bundleDir: string, version: string): void {
  const descriptorFile = path.join(bundleDir, PLAYER_SHELL_DESCRIPTOR_PATH);
  if (!fs.existsSync(descriptorFile)) {
    throw new Error(
      `${bundleDir} carries no ${PLAYER_SHELL_DESCRIPTOR_PATH}, so the studio could not export a `
      + 'playable release. Build it with "pnpm build:web", not "expo export".',
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
  } catch (error) {
    throw new Error(`${descriptorFile} is not readable JSON: ${(error as Error).message}`);
  }

  const descriptor = parsePlayerShellDescriptor(raw);
  if (!descriptor) {
    throw new Error(`${descriptorFile} is not a usable player shell descriptor.`);
  }
  if (descriptor.version !== version) {
    // The app refuses a shell built by a different engine version before it
    // spends a download on it. Caught here, that is a rebuild; caught there, it
    // is an author who cannot publish and has no way to fix it.
    throw new Error(
      `The player shell is version ${descriptor.version} but this studio is ${version}. `
      + 'The app would refuse it. Rebuild with "pnpm build:web".',
    );
  }

  const shellFile = path.join(bundleDir, descriptor.file);
  if (!fs.existsSync(shellFile)) {
    throw new Error(`${descriptorFile} names "${descriptor.file}", which is not beside it.`);
  }
  // Read as a plain view: `Buffer` and this project's DOM-flavoured lib disagree
  // about the backing buffer type, and `createHash` sides with the lib.
  const bytes = new Uint8Array(fs.readFileSync(shellFile));
  if (bytes.byteLength !== descriptor.bytes) {
    throw new Error(
      `${descriptor.file} is ${bytes.byteLength} bytes, but the descriptor says ${descriptor.bytes}.`,
    );
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== descriptor.sha256) {
    throw new Error(
      `${descriptor.file} does not match the digest in ${PLAYER_SHELL_DESCRIPTOR_PATH}. `
      + 'The app verifies it too, so this shell would be rejected after being downloaded.',
    );
  }
}

function assertVersion(version: string): void {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`The studio version must look like 1.2.3, not "${version}".`);
  }
  if (version === TEMPLATE_VERSION) {
    throw new Error(
      `The studio version is still ${TEMPLATE_VERSION}, so no installer could tell two builds apart.`,
    );
  }
}

/**
 * Copy the template, put the studio build beside it and write the version in.
 *
 * The identity is not an input. Every other value a caller could pass is one an
 * author could get wrong once and orphan their own projects with.
 */
export function stageStudioProject(input: StageStudioInput): StagedStudioProject {
  const bundleDir = path.resolve(input.bundleDir);
  const outDir = path.resolve(input.outDir);
  const templateDir = path.resolve(input.templateDir);

  if (!fs.existsSync(path.join(templateDir, 'src-tauri', 'tauri.conf.json'))) {
    throw new Error(`No studio template at ${templateDir}`);
  }
  // Everything that can refuse happens before anything is emptied: a wrong
  // bundle must not cost the author the directory they pointed at.
  assertStudioBundle(bundleDir);
  assertVersion(input.version);
  assertPlayerShell(bundleDir, input.version);

  const transaction = beginOutPath(outDir, {
    repoRoot: input.repoRoot,
    cwd: input.cwd,
    inputs: [bundleDir, templateDir],
  });
  try {
    const workDir = transaction.workPath;
    fs.cpSync(templateDir, workDir, { recursive: true });

    const workFrontendDir = path.join(workDir, FRONTEND_DIR_NAME);
    fs.cpSync(bundleDir, workFrontendDir, { recursive: true });

    // Only this copy. `build:web` writes one bundle that the web channel and the
    // player use unchanged, and neither of them has a Tauri IPC to reach.
    relaxCspForDesktopStudio(path.join(workFrontendDir, 'index.html'));

    const workSrcTauriDir = path.join(workDir, 'src-tauri');
    const workConfigFile = path.join(workSrcTauriDir, 'tauri.conf.json');
    const targets = input.targets && input.targets.length > 0 ? [...input.targets] : undefined;
    writeTauriConfig(workConfigFile, input.version, targets);
    writeCargoVersion(path.join(workSrcTauriDir, 'Cargo.toml'), input.version);

    const frontendFiles = listFiles(workFrontendDir);
    const result = {
      identifier: STUDIO_IDENTIFIER,
      productName: STUDIO_PRODUCT_NAME,
      version: input.version,
      targets: readTauriConfig(workConfigFile).bundle.targets,
      frontendFileCount: frontendFiles.length,
      frontendBytes: frontendFiles.reduce((total, file) => total + fs.statSync(file).size, 0),
      iconsGenerated: hasGeneratedIcons(workSrcTauriDir),
    };
    transaction.commit();

    const srcTauriDir = path.join(outDir, 'src-tauri');
    return {
      outDir,
      srcTauriDir,
      frontendDir: path.join(outDir, FRONTEND_DIR_NAME),
      configFile: path.join(srcTauriDir, 'tauri.conf.json'),
      ...result,
    };
  } catch (error) {
    transaction.abort();
    throw error;
  }
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
 * Only the version is written. `productName` and `identifier` are read back and
 * checked instead: the template is the one place they are allowed to be stated,
 * so a staging step that could set them would be a second place they could
 * differ.
 */
function writeTauriConfig(configFile: string, version: string, targets?: string[]): void {
  const config = readTauriConfig(configFile);
  if (config.identifier !== STUDIO_IDENTIFIER) {
    throw new Error(
      `The studio template's identifier is "${config.identifier}", not "${STUDIO_IDENTIFIER}". `
      + 'Installing under a different identifier hides every project the author already has.',
    );
  }
  if (config.productName !== STUDIO_PRODUCT_NAME) {
    throw new Error(
      `The studio template's product name is "${config.productName}", not "${STUDIO_PRODUCT_NAME}".`,
    );
  }
  config.version = version;
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
 * A separate pass over the files on disk, not assertions inside the writer: a
 * build that produced something unusable has to be distinguishable from one that
 * produced nothing, and the only way to tell is to look at the result.
 */
export function verifyStagedStudioProject(outDir: string): string[] {
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

  if (config.identifier !== STUDIO_IDENTIFIER) {
    problems.push(
      `The identifier is "${config.identifier}", not "${STUDIO_IDENTIFIER}": this installer would `
      + 'open an empty studio on any machine that has the real one.',
    );
  }
  if (config.productName !== STUDIO_PRODUCT_NAME) {
    problems.push(`The product name is "${config.productName}", not "${STUDIO_PRODUCT_NAME}".`);
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
    const html = fs.readFileSync(indexFile, 'utf8');
    for (const origin of TAURI_IPC_ORIGINS) {
      // Without it Tauri's IPC is refused and silently falls back to
      // postMessage. Nothing depends on IPC yet, so this would go unnoticed
      // until the first thing that does.
      if (!html.includes(origin)) {
        problems.push(`The staged index.html does not allow ${origin}: the window's IPC would be blocked.`);
      }
    }
    if (readInlinedPlayerConfig(html)) {
      problems.push('The staged index.html carries a player config: this is a story, not the studio.');
    }
    if (!fs.existsSync(path.join(frontendDir, '_expo'))) {
      problems.push('The staged bundle has no _expo directory: the window would open blank.');
    }
    // Re-read on the staged copy, against the version actually written into the
    // config. The digest was checked before staging; what can still be wrong
    // here is a copy that lost the shell or a version that moved under it.
    const descriptorFile = path.join(frontendDir, PLAYER_SHELL_DESCRIPTOR_PATH);
    const descriptor = fs.existsSync(descriptorFile)
      ? parsePlayerShellDescriptor(JSON.parse(fs.readFileSync(descriptorFile, 'utf8')))
      : null;
    if (!descriptor) {
      problems.push(
        `The staged bundle has no usable ${PLAYER_SHELL_DESCRIPTOR_PATH}: the studio would install `
        + 'and edit, but could not export a playable release.',
      );
    } else if (descriptor.version !== config.version) {
      problems.push(
        `The staged player shell is version ${descriptor.version} but the studio is ${config.version}: `
        + 'the app would refuse it.',
      );
    } else if (!fs.existsSync(path.join(frontendDir, descriptor.file))) {
      problems.push(`The staged bundle is missing the player shell "${descriptor.file}".`);
    }
  }

  for (const required of ['Cargo.toml', 'build.rs', path.join('src', 'main.rs')]) {
    if (!fs.existsSync(path.join(srcTauriDir, required))) {
      problems.push(`The staged project has no src-tauri/${required.split(path.sep).join('/')}.`);
    }
  }

  return problems;
}
