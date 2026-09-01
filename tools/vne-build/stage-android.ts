/**
 * Turn a `.vnerelease` into an Expo project EAS can build into an APK or AAB.
 *
 * **Why a staged copy rather than a flag on this repository.** Three things the
 * engine's own project cannot carry: `expo.autolinking.android.exclude` lives in
 * `package.json`, which the studio shares and which needs the pickers this cut
 * removes; `eas.json` here sets `appVersionSource: "remote"`, which makes EAS's
 * server the authority on version codes and would silently ignore one derived
 * from the release; and the story has to reach Metro through *static* `require`
 * calls, which means generating a module, which means writing a file that has no
 * business being committed.
 *
 * **Why the media is a generated module of requires.** An environment variable
 * naming a path is invisible to Metro — it bundles what it can see through a
 * static `require`, so a release passed that way would simply not be in the APK.
 * The reader would launch to a story with no pictures, on a device, after a
 * twenty-minute cloud build.
 *
 * Everything here runs on a machine with no Android SDK. The build helper calls
 * it before submitting the verified project to EAS; an Expo account, an EAS
 * project and preconfigured signing credentials are the external boundary.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { chooseIconSource, type IconCandidate, type IconChoice } from '../lib/icon-source';
import { beginOutPath } from '../lib/out-path';

import { RELEASE_MEDIA_DIR, releaseObjectFileName } from '@/lib/release/asset-map';
import {
  deriveAndroidIdentity,
  isValidApplicationId,
  type AndroidIdentity,
} from '@/lib/release/native-identity';
import { extractReleaseArchive, readReleaseManifest } from '@/lib/release/package';
import {
  buildPlayerBootConfig,
  findUnpackagedBundledReferences,
  type PlayerBootConfig,
} from '@/lib/release/player-bundle';
import { parsePlayerConfig } from '@/lib/player-mode';
import type { ReleaseManifestV1, ReleasePayloadV1 } from '@/lib/release/types';
import type { StoryArchiveBinarySource, StoryBackupAsset } from '@/lib/story-backup/types';

/**
 * The one description of the player profile, imported rather than restated.
 * A default import, not `require`: this module is loaded as ESM under `tsx` and
 * as CommonJS under the test runner, and `import.meta` would break the second.
 */
import playerProfileModule from '../../player-profile.js';
import { ENGINE_EAS_PROJECT_ID } from '../../app.config.js';

const playerProfile = playerProfileModule as unknown as {
  PLAYER_BLOCKED_TREES: string[];
  PLAYER_BLOCKED_PERMISSIONS: string[];
  PLAYER_AUTOLINKING_EXCLUDE: string[];
  PLAYER_FORBIDDEN_MODULES: string[];
  playerAutolinkingPackageJson: () => { expo: { autolinking: unknown } };
};

/**
 * Top-level entries the staged project needs, named rather than filtered.
 *
 * An allowlist because the repository root also holds build output, editor
 * scratch directories and half a dozen stray logs — a deny-list would upload all
 * of it, and would keep uploading whatever appears next. What makes this safe
 * rather than a guess is {@link verifyStagedAndroidProject}, which walks the
 * player's module graph inside the staged copy and fails on anything missing.
 */
export const STAGED_ROOT_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'app.config.js',
  'player-profile.js',
  'metro.config.js',
  'metro-blocklist.js',
  'babel.config.cjs',
  'tsconfig.json',
  'global.css',
  'global.d.ts',
  'expo-env.d.ts',
  'nativewind-env.d.ts',
  'tailwind.config.js',
  'theme.config.js',
  'theme.config.d.ts',
];

export const STAGED_ROOT_DIRS = [
  'app',
  'app-player',
  'assets',
  'components',
  'constants',
  'hooks',
  'lib',
  'stores',
  'patches',
];

/** Where the release's media lands, relative to the staged project root. */
export const STAGED_MEDIA_DIR = `assets/${RELEASE_MEDIA_DIR}`;
/** The boot config, as a file Metro will inline through a static require. */
export const STAGED_RELEASE_JSON = 'assets/player-release.json';
/** The module the runtime imports. Committed as a stub; overwritten here. */
export const GENERATED_MODULE = 'lib/generated/player-release.ts';
export const STAGED_ICON = 'assets/player-icon.png';
export const STAGED_SPLASH = 'assets/player-splash.png';
export const NATIVE_IDENTITY_FILE = '.vne-native-identity.json';

const EAS_PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredNativeIdentity {
  version: 1;
  storyId: string;
  applicationId: string;
  easProjectId: string;
}

export function isEasProjectId(value: string | undefined): value is string {
  return typeof value === 'string' && EAS_PROJECT_ID_PATTERN.test(value);
}

function readStoredNativeIdentity(outDir: string): StoredNativeIdentity | null {
  if (!fs.existsSync(outDir)) return null;
  const identityFile = path.join(outDir, NATIVE_IDENTITY_FILE);
  let raw: unknown;
  if (fs.existsSync(identityFile)) {
    raw = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
  } else {
    // Migrate a project staged before the explicit identity record existed.
    const easFile = path.join(outDir, 'eas.json');
    const releaseFile = path.join(outDir, ...STAGED_RELEASE_JSON.split('/'));
    if (!fs.existsSync(easFile) || !fs.existsSync(releaseFile)) return null;
    const eas = JSON.parse(fs.readFileSync(easFile, 'utf8')) as StagedEasJson;
    const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8')) as PlayerBootConfig;
    const env = eas.build?.['player-apk']?.env ?? {};
    raw = {
      version: 1,
      storyId: (release.story as { id?: unknown })?.id,
      applicationId: env.VNE_PLAYER_APP_ID,
      easProjectId: env.VNE_EAS_PROJECT_ID,
    };
  }
  const record = raw as Partial<StoredNativeIdentity> | null;
  if (
    !record
    || record.version !== 1
    || typeof record.storyId !== 'string'
    || typeof record.applicationId !== 'string'
    || !isEasProjectId(record.easProjectId)
  ) {
    throw new Error(`The existing ${NATIVE_IDENTITY_FILE} is invalid; refusing to mint another app identity.`);
  }
  return record as StoredNativeIdentity;
}

/** Extensions Metro treats as assets in this project (`metro.config.js`). */
export const BUNDLEABLE_MEDIA_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.weba',
  '.mp4', '.webm', '.mov',
]);

export interface StageAndroidInput {
  /** The `.vnerelease` to build. */
  releaseFile: string;
  /** Where the staged project goes. Replaced atomically after verification. */
  outDir: string;
  repoRoot: string;
  cwd?: string;
  /** Overrides the identity derived from the release. Tests use it. */
  identity?: AndroidIdentity;
  /** The author's own EAS project. Required unless engine use is explicitly allowed. */
  easProjectId?: string;
  /** Explicit test-only escape hatch; never inferred from a missing project id. */
  allowEngineProject?: boolean;
  /** A square PNG of at least 512px to use instead of the story cover. */
  iconOverride?: string;
  /** Injectable so a staged project can be byte-identical across runs. */
  generatedAt?: string;
}

export interface StagedAndroidProject {
  outDir: string;
  identity: AndroidIdentity;
  manifest: ReleaseManifestV1;
  icon: IconChoice;
  mediaFiles: string[];
  mediaBytes: number;
  /** Env every build profile in the staged `eas.json` carries. */
  env: Record<string, string>;
  /** Art no longer named by anything the player bundles. See {@link pruneUnreferencedAssets}. */
  prunedAssets: number;
  prunedBytes: number;
  /** Imports the player makes that did not survive the copy. Must be empty. */
  unresolvedModules: { from: string; specifier: string }[];
}

// ── Reading the release ─────────────────────────────────────────────────────

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
 * Write one packaged object into the staged assets. The extractor verifies the
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
      try { fs.closeSync(handle); } catch { /* already closed */ }
      fs.rmSync(target, { force: true });
    },
  };
}

// ── Copying ─────────────────────────────────────────────────────────────────

function copyIfPresent(from: string, to: string): boolean {
  if (!fs.existsSync(from)) return false;
  fs.cpSync(from, to, { recursive: true });
  return true;
}

/**
 * Routes under `app/` the player root actually re-exports.
 *
 * `app-player/reader.tsx` is `export { default } from '@/app/reader'`, so the
 * studio's route files cannot simply be deleted — but every other one can, and
 * should: expo-router never reads them (the root is `app-player/`), Metro never
 * bundles them, and leaving them in the upload makes "the archive contains no
 * editor code" false for no benefit. Derived by reading the wrappers rather than
 * listed, so a wrapper added later is not silently stranded.
 */
export function referencedStudioRoutes(playerRootDir: string): string[] {
  const referenced = new Set<string>();
  for (const entry of fs.readdirSync(playerRootDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const source = fs.readFileSync(path.join(playerRootDir, entry.name), 'utf8');
    for (const match of source.matchAll(/['"]@\/app\/([^'"]+)['"]/g)) referenced.add(match[1]);
  }
  return [...referenced];
}

/** Delete every studio route the player root does not re-export. */
function pruneStudioRoutes(outDir: string, repoRoot: string): string[] {
  const referenced = new Set(referencedStudioRoutes(path.join(repoRoot, 'app-player')));
  const appDir = path.join(outDir, 'app');
  const removed: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const relative = path.relative(appDir, full).split(path.sep).join('/');
      const withoutExtension = relative.replace(/\.[jt]sx?$/, '');
      if (referenced.has(withoutExtension)) continue;
      fs.rmSync(full);
      removed.push(`app/${relative}`);
    }
  };
  walk(appDir);
  for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(path.join(appDir, entry.name));
  }

  // `app/` is now empty of routes and exists only because the player's wrappers
  // resolve into it; expo-router never reads it, the root is `app-player/`.
  return removed;
}

function pruneBlockedTrees(outDir: string): string[] {
  const removed: string[] = [];
  for (const tree of playerProfile.PLAYER_BLOCKED_TREES) {
    const full = path.join(outDir, ...tree.split('/'));
    if (!fs.existsSync(full)) continue;
    fs.rmSync(full, { recursive: true, force: true });
    removed.push(tree);
  }
  return removed;
}

// ── Generated module ────────────────────────────────────────────────────────

/**
 * The module the runtime reads the release out of.
 *
 * One static `require` per media file, because that is the only form Metro can
 * see. The paths are relative rather than aliased: a generated file should not
 * depend on `tsconfig` path mapping surviving into whatever bundles it.
 */
export function generatedReleaseModule(mediaFiles: string[], generatedAt: string): string {
  const toAssets = path.posix.relative(path.posix.dirname(GENERATED_MODULE), 'assets');
  const entries = mediaFiles
    .map((file) => `  '${RELEASE_MEDIA_DIR}/${file}': require('${toAssets}/${RELEASE_MEDIA_DIR}/${file}'),`)
    .join('\n');

  return `/**
 * GENERATED — do not edit, and do not commit a filled-in copy.
 *
 * Written by \`tools/vne-build/stage-android.ts\` at ${generatedAt}. The committed
 * version of this file exports \`null\`; a build that has not been staged is a
 * studio build, and behaves like one.
 */
import type { PackagedRelease } from '@/lib/release/packaged-release';

export const PACKAGED_RELEASE: PackagedRelease | null = {
  config: require('${toAssets}/player-release.json'),
  media: {
${entries}
  },
};
`;
}

/** The committed stub, restored by a test so the repository never keeps a build. */
export const GENERATED_MODULE_STUB = `/**
 * The release a native player build carries — empty in this repository.
 *
 * \`tools/vne-build/stage-android.ts\` overwrites this file in the *staged* copy
 * of the project with one static \`require\` per media object, which is the only
 * form Metro can see. Here it stays null: the studio is not a player, and a
 * committed release would be a story checked into an engine.
 */
import type { PackagedRelease } from '@/lib/release/packaged-release';

export const PACKAGED_RELEASE: PackagedRelease | null = null;
`;

// ── Project files ───────────────────────────────────────────────────────────

function buildEnv(identity: AndroidIdentity, easProjectId?: string): Record<string, string> {
  const env: Record<string, string> = {
    VNE_PROFILE: 'player',
    VNE_PLAYER_APP_ID: identity.applicationId,
    VNE_PLAYER_APP_NAME: identity.productName,
    VNE_PLAYER_VERSION: identity.version,
    VNE_PLAYER_VERSION_CODE: String(identity.androidVersionCode),
    VNE_PLAYER_SLUG: identity.applicationId.split('.').join('-'),
    // Unique per application. Two novels used to register the engine's own
    // scheme, and duplicate registrations are resolved arbitrarily by the OS.
    VNE_PLAYER_SCHEME: identity.urlScheme,
    VNE_PLAYER_ICON: `./${STAGED_ICON}`,
    VNE_PLAYER_SPLASH: `./${STAGED_SPLASH}`,
  };
  if (easProjectId) env.VNE_EAS_PROJECT_ID = easProjectId;
  return env;
}

/**
 * The staged `eas.json`.
 *
 * `appVersionSource: "local"` because the engine's own config says `"remote"`,
 * which makes EAS's stored counter authoritative — it would quietly ignore the
 * version code derived from the release, and the artifact would claim a version
 * nobody chose.
 *
 * Two profiles, not one: a single profile cannot emit both formats, and both are
 * wanted — an APK to hand out, an AAB for an author who wants a Play listing.
 *
 * The identity travels as `env` here rather than as a generated `app.json`, so
 * there is one config (`app.config.js`) with one set of rules, and the values it
 * reads are visible in a file anyone can open.
 */
export function stagedEasJson(env: Record<string, string>): unknown {
  return {
    cli: { version: '>= 18.4.0', appVersionSource: 'local' },
    build: {
      'player-apk': {
        android: { buildType: 'apk' },
        distribution: 'internal',
        env,
      },
      'player-aab': {
        android: { buildType: 'app-bundle' },
        env,
      },
    },
  };
}

/**
 * The staged `package.json`: the engine's, plus the autolinking exclusions.
 *
 * This is the only place they can go. `expo-modules-autolinking` reads its
 * options from `package.json` and from CLI flags — never from the Expo app
 * config — and this repository's own `package.json` is shared with the studio,
 * which needs the pickers. R4 wrote the list and proved it works; this is where
 * it finally applies.
 */
export function stagedPackageJson(source: Record<string, unknown>, identity: AndroidIdentity): unknown {
  const existingExpo = (source.expo ?? {}) as Record<string, unknown>;
  const { expo: autolinkingExpo } = playerProfile.playerAutolinkingPackageJson();
  return {
    ...source,
    name: identity.applicationId.split('.').join('-'),
    version: identity.version,
    expo: { ...existingExpo, ...autolinkingExpo },
  };
}

/** Parse the real autolinking CLI schema; empty or changed output is not success. */
export function parseAutolinkedModulesOutput(output: string): string[] {
  const parsed = JSON.parse(output) as { modules?: unknown };
  if (!Array.isArray(parsed.modules) || parsed.modules.length === 0) {
    throw new Error('autolinking JSON has no non-empty modules array');
  }
  return parsed.modules.map((module) => {
    const packageName = (module as { packageName?: unknown })?.packageName;
    if (typeof packageName !== 'string' || packageName.length === 0) {
      throw new Error('autolinking module has no packageName');
    }
    return packageName;
  });
}

const EAS_IGNORE = `# Uploaded to EAS: everything the staging step wrote, and nothing else.
node_modules/
.expo/
android/
ios/
dist/
dist-player/
*.log
`;

// ── Staging ─────────────────────────────────────────────────────────────────

export async function stageAndroidProject(
  input: StageAndroidInput,
): Promise<StagedAndroidProject> {
  const releaseFile = path.resolve(input.releaseFile);
  const outDir = path.resolve(input.outDir);
  const repoRoot = path.resolve(input.repoRoot);
  // Defaulted to the release's own timestamp rather than to now, so staging the
  // same release twice produces the same files. A build that differs from the
  // last one only in a comment is a build nobody can compare.
  const generatedAt = input.generatedAt;

  if (!fs.existsSync(releaseFile)) throw new Error(`No such release file: ${releaseFile}`);
  const previousIdentity = readStoredNativeIdentity(outDir);
  const easProjectId = input.easProjectId
    ?? previousIdentity?.easProjectId
    ?? (input.allowEngineProject ? ENGINE_EAS_PROJECT_ID : undefined);
  if (!easProjectId) {
    throw new Error('An EAS project id is required unless engine-project use is explicitly allowed.');
  }
  if (!isEasProjectId(easProjectId)) {
    throw new Error('The EAS project id must be a canonical UUID from `eas project:info`.');
  }

  // Read and check the manifest before anything is written. A corrupt archive
  // must fail here rather than after twenty minutes of cloud build.
  const manifest = await readReleaseManifest(fileSource(releaseFile));
  if (manifest.release.payloadHash !== manifest.payload.sha256) {
    throw new Error(
      'The release manifest disagrees with itself about the payload hash '
      + `(${manifest.release.payloadHash} vs ${manifest.payload.sha256}).`,
    );
  }

  const identity = input.identity ?? deriveAndroidIdentity({
    storyId: manifest.story.id,
    title: manifest.story.title,
    version: manifest.release.version,
  });
  if (previousIdentity && (
    previousIdentity.storyId !== manifest.story.id
    || previousIdentity.applicationId !== identity.applicationId
    || previousIdentity.easProjectId !== easProjectId
  )) {
    throw new Error(
      'The existing staged project belongs to a different immutable native identity. '
      + 'Use its original EAS project, or choose a new empty output directory.',
    );
  }

  const transaction = beginOutPath(outDir, {
    repoRoot,
    cwd: input.cwd,
    inputs: [releaseFile, ...(input.iconOverride ? [path.resolve(input.iconOverride)] : [])],
  });
  const stageDir = transaction.workPath;

  try {
    for (const file of STAGED_ROOT_FILES) {
      copyIfPresent(path.join(repoRoot, file), path.join(stageDir, file));
    }
    for (const dir of STAGED_ROOT_DIRS) {
      copyIfPresent(path.join(repoRoot, dir), path.join(stageDir, dir));
    }

    pruneBlockedTrees(stageDir);
    pruneStudioRoutes(stageDir, repoRoot);

    // Before the release's own media lands, so the walk is over source and the
    // engine's art rather than over a hundred megabytes of the author's.
    const graph = await inspectStagedGraph(stageDir);
    pruneUnreachableSource(stageDir, graph.sourceFiles);
    const pruned = pruneUnreferencedAssets(stageDir, graph.assetFiles);

    // Media, streamed out of the archive and verified as it goes.
    const mediaDir = path.join(stageDir, ...STAGED_MEDIA_DIR.split('/'));
    fs.rmSync(mediaDir, { recursive: true, force: true });
    fs.mkdirSync(mediaDir, { recursive: true });
    const { payload } = await extractReleaseArchive(
      fileSource(releaseFile),
      manifest,
      (asset) => mediaFileSink(mediaDir, asset),
    );

    // A reference to art the release did not package. Nothing rescues it in the
    // player profile, so refuse before replacing the destination.
    assertEveryReferencePackaged(payload, manifest);

    const stamp = generatedAt ?? manifest.release.releasedAt;
    const bootConfig = buildPlayerBootConfig({ manifest, payload, generatedAt: stamp });
    fs.writeFileSync(
      path.join(stageDir, ...STAGED_RELEASE_JSON.split('/')),
      JSON.stringify(bootConfig),
    );

    const mediaFiles = fs.readdirSync(mediaDir).sort();
    const generatedFile = path.join(stageDir, ...GENERATED_MODULE.split('/'));
    fs.mkdirSync(path.dirname(generatedFile), { recursive: true });
    fs.writeFileSync(generatedFile, generatedReleaseModule(mediaFiles, stamp));

    const icon = stageIcons(stageDir, repoRoot, bootConfig, input.iconOverride);
    const env = buildEnv(identity, easProjectId);
    fs.writeFileSync(
      path.join(stageDir, 'package.json'),
      `${JSON.stringify(
        stagedPackageJson(
          JSON.parse(fs.readFileSync(path.join(stageDir, 'package.json'), 'utf8')),
          identity,
        ),
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(path.join(stageDir, 'eas.json'), `${JSON.stringify(stagedEasJson(env), null, 2)}\n`);
    fs.writeFileSync(path.join(stageDir, NATIVE_IDENTITY_FILE), `${JSON.stringify({
      version: 1,
      storyId: manifest.story.id,
      applicationId: identity.applicationId,
      easProjectId,
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(stageDir, '.easignore'), EAS_IGNORE);

    const structuralProblems = verifyStagedAndroidProject(stageDir);
    if (structuralProblems.length > 0) {
      throw new Error(`The staged Android project failed verification:\n${structuralProblems.join('\n')}`);
    }
    const mediaBytes = mediaFiles.reduce(
      (total, file) => total + fs.statSync(path.join(mediaDir, file)).size,
      0,
    );
    const finalIcon = icon.file.startsWith(`${stageDir}${path.sep}`)
      ? { ...icon, file: path.join(outDir, path.relative(stageDir, icon.file)) }
      : icon;
    // EAS refuses a project that is not a git repository, and asks — on stdin,
    // which a staging run does not have — whether it may run `git init` itself.
    // No commit is needed: the staged project carries `.easignore`, so the CLI
    // archives the working directory rather than the git index. Found by running
    // a build, which is the only way it could have been found.
    initGitRepository(stageDir);

    transaction.commit();

    return {
      outDir,
      identity,
      manifest,
      icon: finalIcon,
      mediaFiles,
      mediaBytes,
      env,
      prunedAssets: pruned.files,
      prunedBytes: pruned.bytes,
      unresolvedModules: graph.unresolved,
    };
  } catch (error) {
    transaction.abort();
    throw error;
  }
}

/**
 * The launcher icon and the splash.
 *
 * The story cover becomes the icon when it can be one. The **adaptive** icon
 * stays the engine's: Android 8 and later draw the adaptive layers, and a
 * foreground layer needs its subject inside a safe zone that a full-bleed cover
 * does not have — producing one needs a rasterizer, which this pipeline
 * deliberately does not carry. So on a modern phone the launcher shows the
 * engine mark until someone adds image processing, and that is stated rather
 * than discovered.
 *
 * The splash is always the engine's. It is the attribution.
 */
function stageIcons(
  outDir: string,
  repoRoot: string,
  bootConfig: PlayerBootConfig,
  override: string | undefined,
): IconChoice {
  const engineIcon = path.join(repoRoot, 'assets', 'images', 'icon.png');
  const engineSplash = path.join(repoRoot, 'assets', 'images', 'splash-icon.png');

  const candidates: IconCandidate[] = [];
  if (override) {
    candidates.push({ file: path.resolve(override), label: 'the icon you passed' });
  } else {
    const cover = (bootConfig.story as { thumbnailUri?: unknown } | null)?.thumbnailUri;
    const mapped = typeof cover === 'string' ? bootConfig.assets?.[cover] : undefined;
    if (mapped) {
      candidates.push({
        file: path.join(outDir, 'assets', ...mapped.split('/')),
        label: 'the story cover',
      });
    }
  }

  const choice = chooseIconSource(candidates, engineIcon);
  fs.copyFileSync(choice.file, path.join(outDir, ...STAGED_ICON.split('/')));
  fs.copyFileSync(engineSplash, path.join(outDir, ...STAGED_SPLASH.split('/')));
  return choice;
}

/**
 * Refuse a release that names art it does not carry.
 *
 * The web exporter only warns about these, because a `--dist` pointing at a full
 * Expo build still holds the app's own `assets/` tree and the picture would
 * still appear. Nothing rescues them here: the player profile substitutes an
 * empty bundled-asset map and staging then deletes the files, so an unpackaged
 * reference is a guaranteed blank image on a stranger's phone.
 */
export function assertEveryReferencePackaged(
  payload: ReleasePayloadV1,
  manifest: ReleaseManifestV1,
): void {
  const unpackaged = findUnpackagedBundledReferences(payload, manifest);
  if (unpackaged.length === 0) return;
  const shown = unpackaged.slice(0, 5).join(', ');
  throw new Error(
    `The release names ${unpackaged.length} asset(s) it does not carry, and an Android build `
    + `has nothing to resolve them against: ${shown}`
    + (unpackaged.length > 5 ? `, and ${unpackaged.length - 5} more` : ''),
  );
}

// ── Verification ────────────────────────────────────────────────────────────

interface StagedEasJson {
  cli?: { appVersionSource?: string };
  build?: Record<string, { android?: { buildType?: string }; env?: Record<string, string> }>;
}

/**
 * Read the staged project back and check it is what it claims to be.
 *
 * A separate pass over the files on disk rather than assertions inside the
 * writer, for the same reason R7 made verification its own build state: what
 * matters is the result, and the intention is already known to be good. Most of
 * these failures are silent — an APK that builds perfectly and opens on a story
 * with no pictures, or one that ships the editor it was supposed to leave
 * behind.
 */
export function verifyStagedAndroidProject(outDir: string): string[] {
  const problems: string[] = [];
  let storedIdentity: StoredNativeIdentity | null = null;
  const read = (...parts: string[]) => path.join(outDir, ...parts);
  const exists = (...parts: string[]) => fs.existsSync(read(...parts));

  // 1. The native cut. This is the one R4 specified and could not apply.
  if (!exists('package.json')) {
    return ['The staged project has no package.json.'];
  }
  if (!exists(NATIVE_IDENTITY_FILE)) {
    problems.push(`The staged project has no ${NATIVE_IDENTITY_FILE}; update identity cannot be verified.`);
  } else {
    try {
      storedIdentity = JSON.parse(
        fs.readFileSync(read(NATIVE_IDENTITY_FILE), 'utf8'),
      ) as StoredNativeIdentity;
      if (
        storedIdentity.version !== 1
        || typeof storedIdentity.storyId !== 'string'
        || storedIdentity.storyId.length === 0
        || !isValidApplicationId(storedIdentity.applicationId)
      ) {
        problems.push('The stored native identity has invalid story/application fields.');
      }
      if (!isEasProjectId(storedIdentity.easProjectId)) {
        problems.push('The stored EAS project id is not a UUID.');
      }
    } catch (error) {
      problems.push(`${NATIVE_IDENTITY_FILE} is not readable: ${(error as Error).message}`);
    }
  }
  const packageJson = JSON.parse(fs.readFileSync(read('package.json'), 'utf8')) as {
    expo?: { autolinking?: { android?: { exclude?: string[] } }; install?: unknown };
  };
  const excluded = packageJson.expo?.autolinking?.android?.exclude ?? [];
  for (const module of playerProfile.PLAYER_AUTOLINKING_EXCLUDE) {
    if (!excluded.includes(module)) {
      problems.push(`package.json does not exclude ${module} from autolinking, so it will be in the APK.`);
    }
  }
  if (packageJson.expo?.install === undefined) {
    problems.push('The staged package.json lost the engine\'s own `expo` settings.');
  }

  // 2. The version source. `remote` would make EAS's counter authoritative and
  //    silently ignore the version code derived from the release.
  if (!exists('eas.json')) {
    problems.push('The staged project has no eas.json.');
  } else {
    const eas = JSON.parse(fs.readFileSync(read('eas.json'), 'utf8')) as StagedEasJson;
    if (eas.cli?.appVersionSource !== 'local') {
      problems.push(`eas.json says appVersionSource "${eas.cli?.appVersionSource}"; it must be "local".`);
    }
    for (const [profile, buildType] of [['player-apk', 'apk'], ['player-aab', 'app-bundle']]) {
      const entry = eas.build?.[profile];
      if (!entry) { problems.push(`eas.json has no "${profile}" profile.`); continue; }
      if (entry.android?.buildType !== buildType) {
        problems.push(`eas.json profile "${profile}" builds ${entry.android?.buildType}, not ${buildType}.`);
      }
      if (entry.env?.VNE_PROFILE !== 'player') {
        problems.push(`eas.json profile "${profile}" does not set VNE_PROFILE=player, so it would build the studio.`);
      }
      if (!entry.env?.VNE_PLAYER_APP_ID) {
        problems.push(`eas.json profile "${profile}" carries no application id.`);
      }
      if (!entry.env?.VNE_EAS_PROJECT_ID) {
        problems.push(`eas.json profile "${profile}" carries no EAS project id.`);
      }
    }
    // One release, one application. Two profiles that disagree would sideload
    // and list as different apps, and only one of them could take an update.
    const [apk, aab] = ['player-apk', 'player-aab'].map((name) => eas.build?.[name]?.env ?? {});
    if (storedIdentity && (
      storedIdentity.applicationId !== apk.VNE_PLAYER_APP_ID
      || storedIdentity.easProjectId !== apk.VNE_EAS_PROJECT_ID
    )) {
      problems.push('The stored native identity disagrees with eas.json.');
    }
    for (const key of [
      'VNE_PROFILE',
      'VNE_EAS_PROJECT_ID',
      'VNE_PLAYER_APP_ID',
      'VNE_PLAYER_APP_NAME',
      'VNE_PLAYER_VERSION',
      'VNE_PLAYER_VERSION_CODE',
      'VNE_PLAYER_SLUG',
      'VNE_PLAYER_SCHEME',
      'VNE_PLAYER_ICON',
      'VNE_PLAYER_SPLASH',
    ]) {
      if (apk[key] !== aab[key]) {
        problems.push(`The two build profiles disagree about ${key}: "${apk[key]}" and "${aab[key]}".`);
      }
    }
  }

  // 3. The release, and every file it names.
  if (!exists(...STAGED_RELEASE_JSON.split('/'))) {
    problems.push('The staged project carries no release.');
  } else {
    const raw = JSON.parse(
      fs.readFileSync(read(...STAGED_RELEASE_JSON.split('/')), 'utf8'),
    ) as PlayerBootConfig;
    // Parsed the way the app will parse it, not merely inspected. A config this
    // check waves through and `parsePlayerConfig` rejects is an app that builds,
    // installs, and opens on the boot screen forever.
    if (!parsePlayerConfig(raw)) {
      problems.push('The staged release is not one the player could boot from.');
    }
    const config = raw;
    const storyId = (config.story as { id?: unknown } | null)?.id;
    if (storedIdentity && storedIdentity.storyId !== storyId) {
      problems.push('The stored native identity belongs to a different story than the packaged release.');
    }
    if (exists('eas.json')) {
      const eas = JSON.parse(fs.readFileSync(read('eas.json'), 'utf8')) as StagedEasJson;
      const env = eas.build?.['player-apk']?.env ?? {};
      const releaseVersion = (config.release as { version?: unknown } | undefined)?.version;
      if (typeof releaseVersion === 'string' && env.VNE_PLAYER_VERSION !== releaseVersion) {
        problems.push('The native version disagrees with the packaged release version.');
      }
    }
    for (const file of new Set(Object.values(config.assets ?? {}))) {
      if (!exists('assets', ...file.split('/'))) {
        problems.push(`The asset map names ${file}, which is not in the staged project.`);
      }
    }
  }

  // 4. The generated module, and that every require in it is a real file.
  //    Metro fails on a missing one — after the whole project has uploaded.
  if (!exists(...GENERATED_MODULE.split('/'))) {
    problems.push(`The staged project has no ${GENERATED_MODULE}.`);
  } else {
    const generated = fs.readFileSync(read(...GENERATED_MODULE.split('/')), 'utf8');
    if (generated.includes('PACKAGED_RELEASE: PackagedRelease | null = null')) {
      problems.push('The generated release module is still the committed stub: the APK would carry no story.');
    }
    const moduleDir = path.dirname(read(...GENERATED_MODULE.split('/')));
    for (const match of generated.matchAll(/require\('([^']+)'\)/g)) {
      const target = path.resolve(moduleDir, match[1]);
      if (!fs.existsSync(target)) problems.push(`The generated module requires ${match[1]}, which is missing.`);
      else if (
        match[1].includes(`/${RELEASE_MEDIA_DIR}/`)
        && !BUNDLEABLE_MEDIA_EXTENSIONS.has(path.extname(target).toLowerCase())
      ) {
        // Metro only bundles extensions it treats as assets; anything else
        // resolves as source and fails, or silently is not there.
        problems.push(
          `${path.basename(target)} has an extension Metro does not bundle as an asset `
          + `(add it to metro.config.js, or the picture simply will not be in the APK).`,
        );
      }
    }
  }

  // 5. The authoring code that must not be in the upload.
  for (const tree of playerProfile.PLAYER_BLOCKED_TREES) {
    if (exists(...tree.split('/'))) problems.push(`${tree} is still in the staged project.`);
  }
  for (const module of playerProfile.PLAYER_FORBIDDEN_MODULES) {
    if (exists(...module.split('/'))) problems.push(`${module} is still in the staged project.`);
  }

  // 6. Branding.
  for (const file of [STAGED_ICON, STAGED_SPLASH]) {
    if (!exists(...file.split('/'))) problems.push(`The staged project has no ${file}.`);
  }

  return problems;
}

export interface StagedGraph {
  /** Imports the player makes that resolve to nothing in the staged copy. */
  unresolved: { from: string; specifier: string }[];
  /** Files under `assets/` the bundle actually names, repo-relative with `/`. */
  assetFiles: Set<string>;
  /** Source files Metro can reach for Android, staged-project relative. */
  sourceFiles: Set<string>;
}

/**
 * Walk the player's module graph *inside the staged copy*.
 *
 * Two answers come out of one walk. The first is what turns
 * {@link STAGED_ROOT_FILES} and {@link STAGED_ROOT_DIRS} from a hopeful list
 * into a checked one: an allowlist that missed a directory produces a project
 * that uploads cleanly and fails in Metro twenty minutes later, naming one file
 * and none of the reason. The second is which art is still named at all, once
 * the player profile has swapped the bundled-asset map for an empty one.
 *
 * Run before the release's media is written, so the walk reads source rather
 * than a hundred megabytes of the author's pictures.
 */
export async function inspectStagedGraph(outDir: string): Promise<StagedGraph> {
  const { walkModuleGraph } = await import('../lib/module-graph.mjs') as {
    walkModuleGraph: (input: {
      projectRoot: string;
      entries: string[];
      substitutions?: Record<string, string>;
      platformPrefixes?: string[];
    }) => {
      modules: Map<string, string | null>;
      unresolved: { from: string; specifier: string }[];
    };
  };

  const entries = fs.readdirSync(path.join(outDir, 'app-player'))
    .filter((name) => /\.[jt]sx?$/.test(name))
    .map((name) => path.join(outDir, 'app-player', name));

  const { modules, unresolved } = walkModuleGraph({
    projectRoot: outDir,
    entries,
    substitutions: Object.fromEntries(
      moduleSubstitutions().map((entry) => [entry.from, entry.to]),
    ),
    platformPrefixes: ['.android', '.native', ''],
  });

  const assetFiles = new Set<string>();
  const sourceFiles = new Set<string>();
  for (const key of modules.keys()) {
    const normalized = key.split(path.sep).join('/');
    if (normalized.startsWith('assets/')) assetFiles.add(normalized);
    else sourceFiles.add(normalized);
  }
  return { unresolved, assetFiles, sourceFiles };
}

const PRUNABLE_SOURCE_ROOTS = ['app', 'app-player', 'components', 'hooks', 'lib', 'stores'];
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;

/** Remove source EAS would upload even though Android Metro cannot reach it. */
export function pruneUnreachableSource(outDir: string, reachable: Set<string>): string[] {
  const removed: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!SOURCE_FILE_PATTERN.test(entry.name)) continue;
      const relative = path.relative(outDir, full).split(path.sep).join('/');
      if (reachable.has(relative)) continue;
      fs.rmSync(full);
      removed.push(relative);
    }
    removeEmptyDirectories(dir);
  };
  for (const root of PRUNABLE_SOURCE_ROOTS) walk(path.join(outDir, root));
  return removed;
}

function moduleSubstitutions(): { from: string; to: string }[] {
  return (playerProfileModule as unknown as {
    PLAYER_MODULE_SUBSTITUTIONS: { from: string; to: string }[];
  }).PLAYER_MODULE_SUBSTITUTIONS;
}

/**
 * Delete art the staged bundle no longer names.
 *
 * The player profile swaps `lib/bundled-assets.ts` for an empty map, so the demo
 * backgrounds, sample music, sprites and splash art stop being named by any
 * static `require` — and Metro ships what it can see, so what is not named is
 * not in the APK. Leaving the files on disk anyway would still upload them to
 * EAS and still count against the author's patience, without ever reaching a
 * device.
 *
 * Driven by the graph rather than by a list of directories: the set of art the
 * player genuinely uses is whatever it imports after the substitution, and a
 * hand-written list of what to delete would be wrong the first time someone adds
 * an icon.
 */
export function pruneUnreferencedAssets(
  outDir: string,
  referenced: Set<string>,
): { files: number; bytes: number } {
  const assetsDir = path.join(outDir, 'assets');
  if (!fs.existsSync(assetsDir)) return { files: 0, bytes: 0 };

  const keep = new Set(referenced);
  // The Expo config names icons and splash art by path, not by import: nothing
  // in the module graph mentions them, and an app without an icon does not build.
  const appConfig = fs.readFileSync(path.join(outDir, 'app.config.js'), 'utf8');
  for (const match of appConfig.matchAll(/["'`]\.\/(assets\/[^"'`]+)["'`]/g)) keep.add(match[1]);

  // Named here rather than left to run order: this pass happens before staging
  // writes them today, and a reordering that deleted the story or its icon would
  // be caught only by a build.
  keep.add(STAGED_ICON);
  keep.add(STAGED_SPLASH);
  keep.add(STAGED_RELEASE_JSON);

  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const relative = path.relative(outDir, full).split(path.sep).join('/');
      // The release's own media is what the whole artifact exists to carry.
      if (keep.has(relative) || relative.startsWith(`${STAGED_MEDIA_DIR}/`)) continue;
      bytes += fs.statSync(full).size;
      files += 1;
      fs.rmSync(full);
    }
  };
  walk(assetsDir);
  removeEmptyDirectories(assetsDir);
  return { files, bytes };
}

/** A directory that held only deleted files is noise in the upload. */
function removeEmptyDirectories(dir: string): boolean {
  if (!fs.existsSync(dir)) return true;
  let empty = true;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!removeEmptyDirectories(path.join(dir, entry.name))) empty = false;
    } else {
      empty = false;
    }
  }
  if (empty) fs.rmdirSync(dir);
  return empty;
}

/**
 * Make the staged project a git repository.
 *
 * Not for history — nothing is committed — but because `eas build` will not run
 * outside one. Failure is fatal before the atomic replacement: reporting a
 * staged project that EAS will immediately refuse would make the green result
 * misleading, while the previous complete output is still preserved.
 */
function initGitRepository(dir: string): void {
  const result = spawnSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      'Could not make the staged project a git repository, and `eas build` requires one: '
      + (result.stderr || result.error?.message || 'git init failed'),
    );
  }
}
