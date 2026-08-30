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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  GENERATED_MODULE,
  STAGED_ICON,
  STAGED_MEDIA_DIR,
  STAGED_RELEASE_JSON,
  generatedReleaseModule,
  referencedStudioRoutes,
  stagedEasJson,
  stagedPackageJson,
  verifyStagedAndroidProject,
} from '../../../tools/vne-build/stage-android';
import { deriveAndroidIdentity } from '@/lib/release/native-identity';

import playerProfile from '../../../player-profile.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

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
      VNE_PLAYER_APP_ID: identity.applicationId,
      VNE_PLAYER_VERSION_CODE: String(identity.androidVersionCode),
    })));
  }
  if (!skip.has('release')) {
    write(root, STAGED_RELEASE_JSON, JSON.stringify({
      version: 1,
      story: { id: 'story_42', title: 'Rain', scenes: { s1: {} } },
      assets: { 'idb-media://cover': `${'media'}/abc.png` },
      release: { releaseId: 'r1', version: '2.1.0', releasedAt: 'now' },
    }));
    write(root, `${STAGED_MEDIA_DIR}/abc.png`, 'png-bytes');
  }
  if (!skip.has('generated')) {
    write(root, GENERATED_MODULE, generatedReleaseModule(['abc.png'], 'now'));
  }
  write(root, STAGED_ICON, 'icon');
  write(root, 'assets/player-splash.png', 'splash');
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

  it('catches a release with no scenes', () => {
    root = stagedProject({ skip: ['release'] });
    write(root, STAGED_RELEASE_JSON, JSON.stringify({ version: 1, story: { id: 'x', scenes: {} } }));
    expect(verifyStagedAndroidProject(root).join('\n')).toContain('no scenes');
  });

  it('says so when there is no project at all', () => {
    root = tempDir();
    expect(verifyStagedAndroidProject(root)).toEqual(['The staged project has no package.json.']);
  });
});
