/**
 * Turning a release into a project EAS can build.
 *
 * None of this needs an Android SDK, an Expo account or a paid build — which is
 * the reason staging is a library. What it decides is what the APK *is*: which
 * application it installs as, whether the story and its pictures are inside it,
 * and whether the editor and the file pickers came along. Every one of those
 * fails silently. A build of the wrong thing succeeds exactly as loudly as a
 * build of the right one, twenty minutes later, on someone else's machine.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BUNDLEABLE_MEDIA_EXTENSIONS,
  GENERATED_MODULE,
  NATIVE_IDENTITY_FILE,
  STAGED_ICON,
  STAGED_MEDIA_DIR,
  STAGED_RELEASE_JSON,
  assertEveryReferencePackaged,
  generatedReleaseModule,
  parseAutolinkedModulesOutput,
  pruneUnreachableSource,
  referencedStudioRoutes,
  stageAndroidProject,
  stagedEasJson,
  stagedPackageJson,
  verifyStagedAndroidProject,
} from '../../../tools/vne-build/stage-android';
import { deriveAndroidIdentity } from '@/lib/release/native-identity';

import playerProfile from '../../../player-profile.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-8222-222222222222';

const identity = deriveAndroidIdentity({
  storyId: 'story_42',
  title: 'Rain: A Novel',
  version: '2.1.0',
});

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vne-android-'));
}

function write(root: string, relative: string, contents: string): void {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

/**
 * A staged project as the real one comes out, assembled by hand: the full
 * staging reads a `.vnerelease` and copies the whole repository, which is a
 * different thing to test and far too slow to do per case.
 */
function stagedProject(overrides: { skip?: string[] } = {}): string {
  const root = tempDir();
  const skip = new Set(overrides.skip ?? []);

  if (!skip.has('package.json')) {
    write(root, 'package.json', JSON.stringify(
      stagedPackageJson({ name: 'app-template', expo: { install: { exclude: [] } } }, identity),
    ));
  }
  if (!skip.has('eas.json')) {
    write(root, 'eas.json', JSON.stringify(stagedEasJson({
      VNE_PROFILE: 'player',
      VNE_EAS_PROJECT_ID: PROJECT_A,
      VNE_PLAYER_APP_ID: identity.applicationId,
      VNE_PLAYER_VERSION: identity.version,
      VNE_PLAYER_VERSION_CODE: String(identity.androidVersionCode),
    })));
  }
  write(root, NATIVE_IDENTITY_FILE, JSON.stringify({
    version: 1,
    storyId: 'story_42',
    applicationId: identity.applicationId,
    easProjectId: PROJECT_A,
  }));
  if (!skip.has('release')) {
    // A config the *runtime* accepts, not merely one the verifier reads: the
    // story needs a start scene and a non-empty scene table, or the app builds,
    // installs and sits on its boot screen.
    write(root, STAGED_RELEASE_JSON, JSON.stringify({
      version: 1,
      story: { id: 'story_42', title: 'Rain', startSceneId: 's1', scenes: { s1: { id: 's1' } } },
      assets: { 'idb-media://cover': 'media/abc.png' },
      release: { releaseId: 'r1', version: '2.1.0', releasedAt: 'now' },
    }));
    write(root, `${STAGED_MEDIA_DIR}/abc.png`, 'png-bytes');
  }
  if (!skip.has('generated')) {
    write(root, GENERATED_MODULE, generatedReleaseModule(['abc.png'], 'now'));
  }
  write(root, STAGED_ICON, 'icon');
  write(root, 'assets/player-splash.png', 'splash');
  // Metro resolves a substituted module before swapping it, so a properly
  // staged project still carries the originals.
  if (!skip.has('substitutions')) {
    for (const entry of playerProfile.PLAYER_MODULE_SUBSTITUTIONS as { from: string }[]) {
      write(root, entry.from, 'export const x = 1;');
    }
  }
  return root;
}

describe('the staged package.json', () => {
  /**
   * The one thing only a staged project can do. Autolinking reads its
   * exclusions from `package.json` and never from the Expo app config, and this
   * repository's own is shared with the studio, which needs the pickers.
   */
  it('carries the native-module exclusions', () => {
    const staged = stagedPackageJson({ name: 'app-template' }, identity) as {
      expo: { autolinking: { android: { exclude: string[] }; ios: { exclude: string[] } } };
    };
    expect(staged.expo.autolinking.android.exclude).toEqual(playerProfile.PLAYER_AUTOLINKING_EXCLUDE);
    expect(staged.expo.autolinking.ios.exclude).toEqual(playerProfile.PLAYER_AUTOLINKING_EXCLUDE);
  });

  it('keeps the engine\'s own expo settings rather than replacing the block', () => {
    const staged = stagedPackageJson(
      { name: 'app-template', expo: { install: { exclude: ['@react-navigation/native'] } } },
      identity,
    ) as { expo: { install: { exclude: string[] } } };
    expect(staged.expo.install.exclude).toEqual(['@react-navigation/native']);
  });

  it('is named after the application, not after the engine template', () => {
    const staged = stagedPackageJson({ name: 'app-template' }, identity) as
      { name: string; version: string };
    expect(staged.name).toBe(identity.applicationId.split('.').join('-'));
    expect(staged.version).toBe('2.1.0');
  });
});

describe('source upload pruning', () => {
  it('keeps only Android-reachable source files', () => {
    const root = tempDir();
    write(root, 'app-player/index.tsx', 'keep');
    write(root, 'components/Reader.tsx', 'keep');
    write(root, 'components/Editor.tsx', 'remove');
    write(root, 'lib/helper.android.ts', 'keep');
    write(root, 'lib/helper.web.ts', 'remove');
    write(root, 'assets/config.ts', 'outside prunable roots');

    const removed = pruneUnreachableSource(root, new Set([
      'app-player/index.tsx',
      'components/Reader.tsx',
      'lib/helper.android.ts',
    ]));

    expect(removed.sort()).toEqual(['components/Editor.tsx', 'lib/helper.web.ts']);
    expect(fs.existsSync(path.join(root, 'components', 'Reader.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'assets', 'config.ts'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('autolinking CLI output', () => {
  it('fails closed when the JSON schema is empty or changes', () => {
    for (const output of ['{}', '{"modules":[]}', '{"modules":[{}]}']) {
      expect(() => parseAutolinkedModulesOutput(output), output).toThrow();
    }
  });

  it('returns package names from the real schema', () => {
    expect(parseAutolinkedModulesOutput('{"modules":[{"packageName":"expo-asset"}]}'))
      .toEqual(['expo-asset']);
  });
});

describe('the staged eas.json', () => {
  const eas = stagedEasJson({ VNE_PROFILE: 'player' }) as {
    cli: { appVersionSource: string };
    build: Record<string, { android: { buildType: string }; env: Record<string, string> }>;
  };

  /**
   * The engine's own config says "remote", which makes EAS's stored counter the
   * authority — it would ignore the version code derived from the release, and
   * the artifact would claim a version nobody chose.
   */
  it('takes the version from the release rather than from EAS', () => {
    expect(eas.cli.appVersionSource).toBe('local');
  });

  /** One profile cannot emit both formats, and both are wanted. */
  it('has a profile for each format', () => {
    expect(eas.build['player-apk'].android.buildType).toBe('apk');
    expect(eas.build['player-aab'].android.buildType).toBe('app-bundle');
  });

  it('carries the identity into the build environment', () => {
    for (const profile of ['player-apk', 'player-aab']) {
      expect(eas.build[profile].env.VNE_PROFILE, profile).toBe('player');
    }
  });
});

describe('the generated release module', () => {
  it('names every media file in a static require, which is all Metro can see', () => {
    const source = generatedReleaseModule(['a.png', 'b.mp3'], 'now');
    expect(source).toContain("require('../../assets/media/a.png')");
    expect(source).toContain("require('../../assets/media/b.mp3')");
    expect(source).toContain("require('../../assets/player-release.json')");
  });

  it('keys the media by the same path the boot config\'s asset map uses', () => {
    // The map says `media/<sha>.png`; the runtime looks that string up here.
    expect(generatedReleaseModule(['a.png'], 'now')).toContain("'media/a.png':");
  });
});

describe('which studio routes the player still needs', () => {
  /**
   * Read from the wrappers rather than listed, so a route added to `app-player/`
   * later is not silently stranded when the rest of `app/` is dropped.
   */
  it('finds them by reading the player root', () => {
    const referenced = referencedStudioRoutes(path.join(REPO_ROOT, 'app-player'));
    expect(referenced).toContain('reader');
    expect(referenced).toContain('save-load');
    expect(referenced).toContain('settings');
    expect(referenced).not.toContain('document-editor');
  });
});

describe('verifying a staged project', () => {
  let root: string;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('passes one that was staged properly', () => {
    root = stagedProject();
    expect(verifyStagedAndroidProject(root)).toEqual([]);
  });

  /**
   * The failure that puts a file picker in a novel. Autolinking is exactly the
   * kind of exclusion that stops working silently — it did, for one whole stage,
   * while the config echoed it back.
   */
  it('catches a package.json that would link the pickers back in', () => {
    root = stagedProject({ skip: ['package.json'] });
    write(root, 'package.json', JSON.stringify({ name: 'x', expo: { install: {} } }));
    const problems = verifyStagedAndroidProject(root).join('\n');
    expect(problems).toContain('expo-image-picker');
    expect(problems).toContain('will be in the APK');
  });

  it('catches an eas.json that would let EAS choose the version', () => {
    root = stagedProject({ skip: ['eas.json'] });
    write(root, 'eas.json', JSON.stringify({
      cli: { appVersionSource: 'remote' },
      build: { 'player-apk': { android: { buildType: 'apk' }, env: { VNE_PROFILE: 'player', VNE_PLAYER_APP_ID: 'x' } } },
    }));
    const problems = verifyStagedAndroidProject(root).join('\n');
    expect(problems).toContain('must be "local"');
    expect(problems).toContain('no "player-aab" profile');
  });

  /** Without VNE_PROFILE the staged project builds the studio, editor and all. */
  it('catches a profile that would build the studio', () => {
    root = stagedProject({ skip: ['eas.json'] });
    write(root, 'eas.json', JSON.stringify({
      cli: { appVersionSource: 'local' },
      build: {
        'player-apk': { android: { buildType: 'apk' }, env: { VNE_PLAYER_APP_ID: 'x' } },
        'player-aab': { android: { buildType: 'app-bundle' }, env: { VNE_PROFILE: 'player', VNE_PLAYER_APP_ID: 'x' } },
      },
    }));
    expect(verifyStagedAndroidProject(root).join('\n')).toContain('would build the studio');
  });

  /**
   * The quietest failure of all: an APK that installs, opens, and plays a story
   * with no pictures. Nothing about the build says anything went wrong.
   */
  it('catches a media file the asset map names but the project does not have', () => {
    root = stagedProject();
    fs.rmSync(path.join(root, ...STAGED_MEDIA_DIR.split('/'), 'abc.png'));
    expect(verifyStagedAndroidProject(root).join('\n')).toContain('media/abc.png');
  });

  it('catches a generated module that still requires a file nobody wrote', () => {
    root = stagedProject({ skip: ['generated'] });
    write(root, GENERATED_MODULE, generatedReleaseModule(['abc.png', 'gone.png'], 'now'));
    expect(verifyStagedAndroidProject(root).join('\n')).toContain('gone.png, which is missing');
  });

  /**
   * `.bin` is what the asset map falls back to for an object whose MIME type
   * nobody recognised. Metro does not bundle it, so the picture is simply not in
   * the APK — and the build says nothing.
   */
  it('catches media Metro will not bundle as an asset', () => {
    root = stagedProject({ skip: ['generated'] });
    write(root, `${STAGED_MEDIA_DIR}/odd.bin`, 'bytes');
    write(root, GENERATED_MODULE, generatedReleaseModule(['abc.png', 'odd.bin'], 'now'));
    expect(verifyStagedAndroidProject(root).join('\n')).toContain('does not bundle as an asset');
  });

  it('catches the committed stub, which would build an app with no story', () => {
    root = stagedProject({ skip: ['generated'] });
    write(root, GENERATED_MODULE, `
import type { PackagedRelease } from '@/lib/release/packaged-release';
export const PACKAGED_RELEASE: PackagedRelease | null = null;
`);
    expect(verifyStagedAndroidProject(root).join('\n')).toContain('still the committed stub');
  });

  it('catches authoring code that came along', () => {
    root = stagedProject();
    write(root, 'components/document-editor/Whatever.tsx', 'export default null;');
    expect(verifyStagedAndroidProject(root).join('\n')).toContain('components/document-editor is still');
  });

  /**
   * Checked by parsing it the way the app will, rather than by looking for the
   * fields this file happens to think matter. A story with no start scene is the
   * case that motivated it: the verifier waved one through, and the app would
   * have installed, opened on its boot screen and stayed there.
   */
  it('catches a release the player could not actually boot from', () => {
    for (const story of [
      { id: 'x', title: 'Rain', startSceneId: 's1', scenes: {} },
      { id: 'x', title: 'Rain', scenes: { s1: {} } },
      { id: 'x', startSceneId: 's1', scenes: { s1: {} } },
    ]) {
      const project = stagedProject({ skip: ['release'] });
      write(project, STAGED_RELEASE_JSON, JSON.stringify({ version: 1, story }));
      expect(verifyStagedAndroidProject(project).join('\n'), JSON.stringify(story))
        .toContain('could boot from');
      fs.rmSync(project, { recursive: true, force: true });
    }
    root = stagedProject();
  });

  /** One release is one application, whichever format it is built into. */
  it('catches two build profiles that describe different applications', () => {
    root = stagedProject({ skip: ['eas.json'] });
    const eas = stagedEasJson({ VNE_PROFILE: 'player', VNE_PLAYER_APP_ID: 'com.a.b' }) as
      { build: Record<string, { env: Record<string, string> }> };
    eas.build['player-aab'].env = { VNE_PROFILE: 'player', VNE_PLAYER_APP_ID: 'com.other.app' };
    write(root, 'eas.json', JSON.stringify(eas));
    expect(verifyStagedAndroidProject(root).join('\n')).toContain('disagree about VNE_PLAYER_APP_ID');
  });

  it('catches a native identity or version that belongs to another release', () => {
    root = stagedProject();
    write(root, NATIVE_IDENTITY_FILE, JSON.stringify({
      version: 1,
      storyId: 'another-story',
      applicationId: identity.applicationId,
      easProjectId: PROJECT_A,
    }));
    let problems = verifyStagedAndroidProject(root).join('\n');
    expect(problems).toContain('different story');
    fs.rmSync(root, { recursive: true, force: true });

    root = stagedProject({ skip: ['eas.json'] });
    write(root, 'eas.json', JSON.stringify(stagedEasJson({
      VNE_PROFILE: 'player',
      VNE_EAS_PROJECT_ID: PROJECT_A,
      VNE_PLAYER_APP_ID: identity.applicationId,
      VNE_PLAYER_VERSION: '2.2.0',
      VNE_PLAYER_VERSION_CODE: String(identity.androidVersionCode),
    })));
    problems = verifyStagedAndroidProject(root).join('\n');
    expect(problems).toContain('native version disagrees');
  });

  it('compares signing project and every visible identity field across profiles', () => {
    root = stagedProject({ skip: ['eas.json'] });
    const eas = stagedEasJson({
      VNE_PROFILE: 'player',
      VNE_EAS_PROJECT_ID: PROJECT_A,
      VNE_PLAYER_APP_ID: 'com.a.b',
      VNE_PLAYER_APP_NAME: 'Rain',
      VNE_PLAYER_VERSION: '2.1.0',
      VNE_PLAYER_VERSION_CODE: '2001000',
      VNE_PLAYER_SLUG: 'com-a-b',
      VNE_PLAYER_ICON: './assets/player-icon.png',
      VNE_PLAYER_SPLASH: './assets/player-splash.png',
    }) as { build: Record<string, { env: Record<string, string> }> };
    eas.build['player-aab'].env = {
      ...eas.build['player-aab'].env,
      VNE_EAS_PROJECT_ID: PROJECT_B,
      VNE_PLAYER_ICON: './other.png',
    };
    write(root, 'eas.json', JSON.stringify(eas));
    const problems = verifyStagedAndroidProject(root).join('\n');
    expect(problems).toContain('disagree about VNE_EAS_PROJECT_ID');
    expect(problems).toContain('disagree about VNE_PLAYER_ICON');
  });

  it('says so when there is no project at all', () => {
    root = tempDir();
    expect(verifyStagedAndroidProject(root)).toEqual(['The staged project has no package.json.']);
  });
});

describe('art the release does not carry', () => {
  const manifest = {
    assets: [{ assetId: 'a1', sourceReferences: ['assets/background/kept.png'] }],
  } as never;

  it('passes a release that packaged everything its story names', () => {
    const payload = { scenes: { s1: { bg: 'assets/background/kept.png' } } } as never;
    expect(() => assertEveryReferencePackaged(payload, manifest)).not.toThrow();
  });

  /**
   * Fatal here, where the web exporter only warns. A `--dist` pointing at a full
   * Expo build still holds the app's own `assets/` tree, so on the web the
   * picture may still appear. On Android the player profile substitutes an empty
   * bundled-asset map and staging deletes the files, so this is a guaranteed
   * blank image on a stranger's phone.
   */
  it('refuses one that names art nobody packaged', () => {
    const payload = { scenes: { s1: { bg: 'assets/background/missing.png' } } } as never;
    expect(() => assertEveryReferencePackaged(payload, manifest))
      .toThrow('assets/background/missing.png');
  });

  it('also checks manifest-level cover art merged into the player story', () => {
    const withMissingCover = {
      assets: [{ assetId: 'a1', sourceReferences: ['assets/background/kept.png'] }],
      story: { thumbnailUri: 'assets/background/missing-cover.png' },
    } as never;
    expect(() => assertEveryReferencePackaged({ scenes: {} } as never, withMissingCover))
      .toThrow('assets/background/missing-cover.png');
  });

  it('names a few and counts the rest rather than printing hundreds', () => {
    const scenes = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`s${i}`, { bg: `assets/background/m${i}.png` }]),
    );
    expect(() => assertEveryReferencePackaged({ scenes } as never, manifest))
      .toThrow('and 4 more');
  });
});

describe('the staging API EAS ownership invariant', () => {
  it('refuses a missing project id unless engine use is explicit', async () => {
    const outDir = path.join(tempDir(), 'stage');
    await expect(stageAndroidProject({
      releaseFile: path.join(REPO_ROOT, 'e2e', 'player', '.demo.vnerelease'),
      outDir,
      repoRoot: REPO_ROOT,
    })).rejects.toThrow('EAS project id is required');
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it('refuses a non-UUID project id before touching the output', async () => {
    const outDir = path.join(tempDir(), 'stage');
    await expect(stageAndroidProject({
      releaseFile: path.join(REPO_ROOT, 'e2e', 'player', '.demo.vnerelease'),
      outDir,
      repoRoot: REPO_ROOT,
      easProjectId: 'project-from-a-typo',
    })).rejects.toThrow('canonical UUID');
    expect(fs.existsSync(outDir)).toBe(false);
  });
});

/**
 * Metro bundles a file as an asset only if its extension is in `assetExts`.
 * Anything else resolves as source and fails, or is simply not there — and the
 * verifier's whole job is to catch that before a build, so the two lists have to
 * be the same list. `.weba`, which is what a release calls an `audio/webm`
 * object, was in one and not the other.
 */
describe('the extensions the verifier will accept', () => {
  it('are all extensions Metro actually bundles', () => {
    // Asked of Metro in a real Node process rather than imported here: the test
    // runner cannot load `expo/metro-config`, and a hand-copied list of defaults
    // would be the same duplication this test exists to catch.
    const probe = spawnSync(process.execPath, ['-e', `
      const { getDefaultConfig } = require('expo/metro-config');
      const declared = require('./metro.config.js').resolver.assetExts;
      process.stdout.write(JSON.stringify([
        ...getDefaultConfig(process.cwd()).resolver.assetExts,
        ...declared,
      ]));
    `], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(probe.status, probe.stderr).toBe(0);

    const bundled = new Set(JSON.parse(probe.stdout) as string[]);
    for (const extension of BUNDLEABLE_MEDIA_EXTENSIONS) {
      expect(bundled.has(extension.replace('.', '')), extension).toBe(true);
    }
  });
});

/**
 * The substitution is the player build's whole mechanism, and it is fragile in
 * one specific way: Metro resolves a request and *then* swaps the resolved file,
 * so the module being replaced has to still be on disk. A staging step that
 * prunes what the module graph cannot reach will not reach it — the graph walk
 * applies the same substitution — and deleting it breaks the bundle with
 * "Unable to resolve module" rather than shrinking it.
 *
 * This is the failure that killed the first real EAS build, at 87% of the way
 * through bundling, twenty minutes in.
 */
describe('modules the player build substitutes', () => {
  const substituted = (playerProfile.PLAYER_MODULE_SUBSTITUTIONS as { from: string; to: string }[])
    .map((entry) => entry.from);

  it('has some, and they are the ones the profile names', () => {
    expect(substituted).toContain('stores/use-app-store.ts');
    expect(substituted.length).toBeGreaterThan(0);
  });

  it('survive the prune that removes everything unreachable', () => {
    const root = tempDir();
    try {
      for (const file of [...substituted, 'lib/orphan.ts', 'lib/kept.ts']) {
        write(root, file, 'export const x = 1;');
      }
      const removed = pruneUnreachableSource(root, new Set(['lib/kept.ts']));

      for (const file of substituted) {
        expect(fs.existsSync(path.join(root, ...file.split('/'))), file).toBe(true);
        expect(removed, file).not.toContain(file);
      }
      expect(removed).toContain('lib/orphan.ts');
      expect(fs.existsSync(path.join(root, 'lib', 'kept.ts'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * `stores/use-app-store.ts` is on both lists: forbidden from the player's
   * module graph, and required on disk for the swap. The verifier used to read
   * the first as "must not exist" and failed the project that satisfied the
   * second.
   */
  it('are not reported as authoring code that came along', () => {
    const root = stagedProject();
    try {
      expect(verifyStagedAndroidProject(root).join('\n')).not.toContain('is still in the staged project');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('are reported when they are missing, naming what the bundler would say', () => {
    const root = stagedProject({ skip: ['substitutions'] });
    try {
      const problems = verifyStagedAndroidProject(root).join('\n');
      expect(problems).toContain('Unable to resolve module');
      expect(problems).toContain('stores/use-app-store.ts');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
