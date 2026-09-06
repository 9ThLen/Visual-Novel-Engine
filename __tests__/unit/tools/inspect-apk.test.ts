/**
 * Reading a built APK back.
 *
 * The permission list, the identity and the signing key of the artifact a
 * reader installs are the acceptances no test of the pipeline can answer: they
 * are properties of what came out, not of what went in. They were checked by
 * hand with throwaway scripts, which is how a check quietly stops happening, so
 * they are a command — and these cases exist so the command can be trusted
 * without a 170 MB artifact to hand.
 *
 * The first version of that command was too weak to carry the claim, and the
 * cases that would have caught it are the ones marked below.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';

import { inspectApk, KNOWN_UNREMOVABLE_PERMISSIONS } from '../../../tools/vne-build/inspect-apk';
import { fakeManifest } from '../../helpers/android-manifest';
import { makeSigningKey, signApk, signApkBadly } from '../../helpers/apk-signing';
import playerProfile from '../../../player-profile.js';

const KEY = makeSigningKey();
const OTHER_KEY = makeSigningKey('Somebody Else');

describe('inspecting a built APK', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  function write(bytes: Uint8Array): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vne-apk-'));
    directories.push(directory);
    const file = path.join(directory, 'player.apk');
    fs.writeFileSync(file, bytes);
    return file;
  }

  function apk(options: {
    permissions?: string[];
    mentionedOnly?: string[];
    applicationId?: string;
    versionCode?: number;
    versionName?: string;
    entries?: Record<string, Uint8Array>;
    unsigned?: boolean;
    tampered?: boolean;
    key?: typeof KEY;
  } = {}): string {
    const zip = zipSync({
      'AndroidManifest.xml': fakeManifest(options),
      'classes.dex': new Uint8Array([1, 2, 3]),
      ...options.entries,
    });
    if (options.unsigned) return write(zip);
    const key = options.key ?? KEY;
    return write(options.tampered ? signApkBadly(zip, key) : signApk(zip, key));
  }

  it('reports the declared permissions and the identity', () => {
    const report = inspectApk(apk({
      permissions: ['android.permission.INTERNET', 'android.permission.VIBRATE'],
      applicationId: 'com.vne.story.museum.s7abc',
      versionCode: 1_000_001,
      versionName: '1.0.1',
    }));

    expect(report.permissions).toEqual([
      'android.permission.INTERNET',
      'android.permission.VIBRATE',
    ]);
    expect(report.applicationId).toBe('com.vne.story.museum.s7abc');
    expect(report.versionCode).toBe(1_000_001);
    expect(report.versionName).toBe('1.0.1');
    expect(report.problems).toEqual([]);
  });

  /**
   * The case the tool exists for. A novel that can take photographs is a novel
   * nobody installs, and nothing before the artifact can prove it cannot.
   */
  it('fails when a blocked permission reached the artifact', () => {
    const blocked = (playerProfile.PLAYER_BLOCKED_PERMISSIONS as string[])
      .find((name) => !(name in KNOWN_UNREMOVABLE_PERMISSIONS));
    expect(blocked, 'the profile blocks nothing that is not already excused').toBeTruthy();

    const report = inspectApk(apk({ permissions: ['android.permission.INTERNET', blocked as string] }));
    expect(report.leaked).toEqual([blocked]);
    expect(report.problems.join(' ')).toContain(blocked as string);
  });

  /**
   * What the string scan could not do. The name is in the manifest either way;
   * only one of the two is a grant.
   */
  it('does not fail over a blocked name that nothing declares', () => {
    const blocked = (playerProfile.PLAYER_BLOCKED_PERMISSIONS as string[])
      .find((name) => !(name in KNOWN_UNREMOVABLE_PERMISSIONS)) as string;

    const report = inspectApk(apk({
      permissions: ['android.permission.INTERNET'],
      mentionedOnly: [blocked],
    }));
    expect(report.leaked).toEqual([]);
    expect(report.problems).toEqual([]);
  });

  /**
   * The false positive that put an open question in the plan.
   *
   * `android.permission.DUMP` sits in the string pool of every artifact built
   * so far and is declared by none of them — `aapt` does not collect pool
   * entries whose element the merger removed. The old string scan read that as
   * a permission surviving its own removal rule, and the tool carried a
   * standing exception for a permission that was never granted.
   */
  it('does not report DUMP, which only ever sat in the string pool', () => {
    const report = inspectApk(apk({
      permissions: ['android.permission.INTERNET'],
      mentionedOnly: ['android.permission.DUMP'],
    }));
    expect(report.permissions).toEqual(['android.permission.INTERNET']);
    expect(report.tolerated).toEqual([]);
    expect(report.problems).toEqual([]);
  });

  it('excuses nothing until something is demonstrated against a parsed manifest', () => {
    expect(KNOWN_UNREMOVABLE_PERMISSIONS).toEqual({});
  });

  /** The exception mechanism still works, for a permission that really is stuck. */
  it('separates an acknowledged exception from a real leak', () => {
    const [first, second] = playerProfile.PLAYER_BLOCKED_PERMISSIONS as string[];
    KNOWN_UNREMOVABLE_PERMISSIONS[first] = 'stuck, for the sake of this test';
    try {
      const report = inspectApk(apk({ permissions: [first, second] }));
      expect(report.tolerated).toEqual([first]);
      expect(report.leaked).toEqual([second]);
      expect(report.problems).toHaveLength(1);
    } finally {
      delete KNOWN_UNREMOVABLE_PERMISSIONS[first];
    }
  });

  describe('the signing key', () => {
    it('reports the certificate the signature actually used', () => {
      const report = inspectApk(apk());
      expect(report.signing.verified).toBe(true);
      expect(report.signing.schemes).toEqual(['v2']);
      expect(report.signing.certificateFingerprint).toBe(KEY.fingerprint);
      expect(report.signing.subject).toContain('VNE Test');
    });

    /** An unsigned artifact cannot install, and used to be reported in green. */
    it('fails an unsigned artifact', () => {
      const report = inspectApk(apk({ unsigned: true }));
      expect(report.signing.verified).toBe(false);
      expect(report.problems.join(' ')).toMatch(/refuse to install/);
    });

    /**
     * The first version of this check looked for the block's magic anywhere in
     * the file, so an unsigned APK that merely shipped the string passed.
     */
    it('is not fooled by the magic sitting in an asset', () => {
      const report = inspectApk(apk({
        unsigned: true,
        entries: { 'assets/note.txt': new TextEncoder().encode('APK Sig Block 42') },
      }));
      expect(report.signing.present).toBe(false);
    });

    /**
     * The case that separates verifying from reading. A signature block copied
     * from a real APK parses perfectly; only recomputing the digest over these
     * bytes can tell that it describes a different file.
     */
    it('fails when the file no longer matches what was signed', () => {
      const report = inspectApk(apk({ tampered: true }));
      expect(report.signing.present).toBe(true);
      expect(report.signing.verified).toBe(false);
      expect(report.signing.problem).toMatch(/content digest|does not verify/);
      expect(report.signing.certificateFingerprint).toBeNull();
    });

    it('fails when the key is not the one the story is already signed with', () => {
      const report = inspectApk(apk(), { certificateFingerprint: OTHER_KEY.fingerprint });
      expect(report.problems.join(' ')).toMatch(/losing their saves/);
    });

    /** Two builds of one story, and the check that they can update each other. */
    it('passes when the same key signed both', () => {
      const first = inspectApk(apk({ versionCode: 1_000_000 }));
      const second = inspectApk(apk({ versionCode: 1_000_001 }), {
        // Spelled without colons, as some tools print it: the comparison
        // normalises rather than matching raw strings.
        certificateFingerprint: first.signing.certificateFingerprint!.replaceAll(':', '').toLowerCase(),
      });
      expect(second.problems).toEqual([]);
    });

    it('catches a story rebuilt with a different key', () => {
      const first = inspectApk(apk());
      const second = inspectApk(apk({ key: OTHER_KEY }), {
        certificateFingerprint: first.signing.certificateFingerprint!,
      });
      expect(second.signing.verified).toBe(true); // the new key signs fine
      expect(second.problems.join(' ')).toMatch(/losing their saves/); // and is the wrong key
    });

    it('refuses a fingerprint that is not one', () => {
      const report = inspectApk(apk(), { certificateFingerprint: 'probably-fine' });
      expect(report.problems.join(' ')).toContain('not a SHA-256 certificate fingerprint');
    });
  });

  /**
   * The three things Android checks before it lets a v2 install over a v1. EAS
   * metadata describes what was asked for; this describes what arrived.
   */
  describe('against an expected identity', () => {
    it('fails on a mismatched application id', () => {
      const report = inspectApk(apk({ applicationId: 'com.vne.story.other.s2' }), {
        applicationId: 'com.vne.story.museum.s7abc',
      });
      expect(report.problems.join(' ')).toMatch(/only installs over a matching id/);
    });

    it('fails on a version code that is not the derived one', () => {
      const report = inspectApk(apk({ versionCode: 1_000_000 }), { versionCode: 1_000_001 });
      expect(report.problems.join(' ')).toMatch(/does not increase/);
    });

    it('passes when all of them agree', () => {
      const report = inspectApk(
        apk({ applicationId: 'com.vne.story.museum.s7abc', versionCode: 1_000_001, versionName: '1.0.1' }),
        {
          applicationId: 'com.vne.story.museum.s7abc',
          versionCode: 1_000_001,
          versionName: '1.0.1',
          certificateFingerprint: KEY.fingerprint,
        },
      );
      expect(report.problems).toEqual([]);
    });
  });

  it('finds the media and the native slices', () => {
    const report = inspectApk(apk({
      entries: {
        'res/aB.png': new Uint8Array(2048),
        'res/cD.mp3': new Uint8Array(4096),
        'res/values.xml': new Uint8Array(10),
        'lib/arm64-v8a/libx.so': new Uint8Array(8),
        'lib/x86_64/libx.so': new Uint8Array(8),
      },
    }));
    expect(report.mediaEntries).toBe(2);
    expect(report.mediaBytes).toBe(2048 + 4096);
    expect(report.nativeAbis).toEqual(['arm64-v8a', 'x86_64']);
  });

  it('refuses something that is not an APK', () => {
    const file = write(zipSync({ 'readme.txt': new Uint8Array([1]) }));
    expect(() => inspectApk(file)).toThrow('not an APK');
  });

  /** A manifest it cannot parse must be an error, never an empty permission list. */
  it('refuses an unreadable manifest rather than reporting nothing', () => {
    const file = write(zipSync({ 'AndroidManifest.xml': new TextEncoder().encode('<manifest/>') }));
    expect(() => inspectApk(file)).toThrow(/bad magic/);
  });
});
