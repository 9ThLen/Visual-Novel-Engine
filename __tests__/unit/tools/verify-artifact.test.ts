/**
 * The check both build paths must go through.
 *
 * It was optional and therefore skipped on the route most authors take: the
 * helper the browser drives downloaded a file and handed it back, with only a
 * zip-structure check between EAS and the reader. These cases pin the two
 * properties that fixes that — nothing passes unverified, and a story's signing
 * key is remembered so the second build can be compared to the first.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';

import {
  readSigningRecord,
  signingRecordFile,
  UnverifiableArtifact,
  verifyBuiltArtifact,
} from '../../../tools/vne-build/verify-artifact';
import { fakeManifest } from '../../helpers/android-manifest';
import { makeSigningKey, signApk, type SigningKey } from '../../helpers/apk-signing';
import playerProfile from '../../../player-profile.js';
import { fakeApksigner } from '../../helpers/fake-apksigner';

const KEY = makeSigningKey('The Author');
const STOLEN = makeSigningKey('Somebody Else');

const APPLICATION_ID = 'com.vne.story.museum.s7abc';

describe('verifying a finished build', () => {
  let repoRoot: string;
  let workspace: string;
  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vne-verify-'));
    repoRoot = path.join(workspace, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
  });
  afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

  function artifact(options: {
    key?: SigningKey;
    versionCode?: number;
    permissions?: string[];
    applicationId?: string;
    name?: string;
    rotation?: boolean;
  } = {}): string {
    const file = path.join(workspace, options.name ?? `player-${Math.random().toString(36).slice(2)}.apk`);
    fs.writeFileSync(file, signApk(zipSync({
      'AndroidManifest.xml': fakeManifest({
        applicationId: options.applicationId ?? APPLICATION_ID,
        versionCode: options.versionCode ?? 1_000_000,
        permissions: options.permissions ?? ['android.permission.INTERNET'],
      }),
      'classes.dex': new Uint8Array([1, 2, 3]),
    }), options.key ?? KEY, undefined, options.rotation ? ['v3-rotated'] : ['v2']));
    return file;
  }

  // The authority is injected throughout: these cases are about what this
  // repository does with a verdict, and requiring the Android SDK to ask them
  // would make the suite pass only where somebody had installed it.
  const verify = (file: string, expected = {}, authority = fakeApksigner()) => verifyBuiltArtifact({
    file,
    target: 'apk',
    expected: { applicationId: APPLICATION_ID, ...expected },
    repoRoot,
    signatureAuthority: authority,
  });

  describe('remembering the signing key', () => {
    it('records it on the first verified build', async () => {
      const report = await verify(artifact());
      const record = readSigningRecord(repoRoot, APPLICATION_ID);
      expect(record?.fingerprint).toBe(KEY.fingerprint);
      expect(record?.fingerprint).toBe(report.signing.certificateFingerprint);
    });

    it('accepts a later build signed with the same key', async () => {
      await verify(artifact({ versionCode: 1_000_000 }));
      await expect(verify(artifact({ versionCode: 1_000_001 }), { versionCode: 1_000_001 }))
        .resolves.toBeTruthy();
    });

    /**
     * The failure the whole application-id design exists to prevent, caught
     * before the artifact reaches anyone rather than by a reader whose update
     * will not install.
     */
    it('refuses a later build signed with a different key', async () => {
      await verify(artifact());
      await expect(verify(artifact({ key: STOLEN })))
        .rejects.toThrow(/losing their saves/);
    });

    it('does not record a key from an artifact that failed', async () => {
      const blocked = (playerProfile.PLAYER_BLOCKED_PERMISSIONS as string[])[0];
      await expect(verify(artifact({ permissions: [blocked] }))).rejects.toThrow(UnverifiableArtifact);
      // A record minted here would pin the story to this key for good, on the
      // strength of an artifact that was rejected.
      expect(readSigningRecord(repoRoot, APPLICATION_ID)).toBeNull();
    });

    it('refuses a damaged record rather than minting a new one', async () => {
      await verify(artifact());
      fs.writeFileSync(signingRecordFile(repoRoot, APPLICATION_ID), '{"version":1}');
      await expect(verify(artifact())).rejects.toThrow(/invalid/);
    });

    it('keeps one story per record, not one per machine', async () => {
      await verify(artifact());
      const other = 'com.vne.story.other.s9zzz';
      await verifyBuiltArtifact({
        file: artifact({ applicationId: other, key: STOLEN }),
        target: 'apk',
        expected: { applicationId: other },
        repoRoot,
        signatureAuthority: fakeApksigner(),
      });
      expect(readSigningRecord(repoRoot, APPLICATION_ID)?.fingerprint).toBe(KEY.fingerprint);
      expect(readSigningRecord(repoRoot, other)?.fingerprint).toBe(STOLEN.fingerprint);
    });

    /**
     * The old locations, which a story may already have a record in. Reading
     * only the new one would have quietly undone the fix that introduced it: a
     * story with a known key would look unbuilt, and any artifact would be
     * taken as its first.
     */
    describe('records written by earlier versions', () => {
      const legacy = (...segments: string[]) => path.join(repoRoot, '.vne-builds', ...segments);

      function writeLegacy(where: string, fingerprint: string): void {
        fs.mkdirSync(path.dirname(where), { recursive: true });
        fs.writeFileSync(where, JSON.stringify({
          version: 1,
          applicationId: APPLICATION_ID,
          fingerprint,
          firstSeen: '2026-01-01T00:00:00.000Z',
        }));
      }

      it.each([
        ['the command line\'s', () => legacy(`${APPLICATION_ID}.signing.json`)],
        ['the helper\'s', () => legacy('eas-identities', `${APPLICATION_ID}.signing.json`)],
      ])('still compares against %s', async (_name, where) => {
        writeLegacy(where(), KEY.fingerprint);
        await expect(verify(artifact({ key: STOLEN }))).rejects.toThrow(/losing their saves/);
      });

      it('carries the record forward on the way past', async () => {
        writeLegacy(legacy(`${APPLICATION_ID}.signing.json`), KEY.fingerprint);
        await verify(artifact());
        expect(fs.existsSync(signingRecordFile(repoRoot, APPLICATION_ID))).toBe(true);
        expect(readSigningRecord(repoRoot, APPLICATION_ID)?.fingerprint).toBe(KEY.fingerprint);
      });

      /**
       * Two old locations naming two keys means the machine has already
       * accepted both. Picking one here would hide that rather than settle it.
       */
      it('refuses when the old locations disagree', () => {
        writeLegacy(legacy(`${APPLICATION_ID}.signing.json`), KEY.fingerprint);
        writeLegacy(legacy('eas-identities', `${APPLICATION_ID}.signing.json`), STOLEN.fingerprint);
        expect(() => readSigningRecord(repoRoot, APPLICATION_ID))
          .toThrow(/2 different keys/);
      });
    });
  });

  describe('what it refuses', () => {

  /**
   * The state that existed and could not be reached. Any unverified signature
   * became a problem before apksigner was consulted, so an artifact this
   * repository's reader abstained on failed no matter what the authority said
   * -- and the key would have been recorded from a fingerprint that was null
   * precisely then.
   */
  describe('when this reader abstains', () => {
    const rotated = () => artifact({ rotation: true });

    it('accepts the artifact on the authority', async () => {
      const report = await verify(rotated(), {}, fakeApksigner({ fingerprints: [KEY.fingerprint] }));
      expect(report.signing.unsupported).toBe(true);
      expect(report.signing.certificateFingerprint).toBeNull();
      expect(report.problems).toEqual([]);
    });

    it('records the key apksigner named, not the null it had', async () => {
      await verify(rotated(), {}, fakeApksigner({ fingerprints: [KEY.fingerprint] }));
      expect(readSigningRecord(repoRoot, APPLICATION_ID)?.fingerprint).toBe(KEY.fingerprint);
    });

    it('still refuses a later build under a different key', async () => {
      await verify(rotated(), {}, fakeApksigner({ fingerprints: [KEY.fingerprint] }));
      await expect(verify(rotated(), {}, fakeApksigner({ fingerprints: [STOLEN.fingerprint] })))
        .rejects.toThrow(/losing their saves/);
    });

    /** Which of several signers a device holds an app to is not a coin toss. */
    it('refuses when apksigner names more than one signer', async () => {
      await expect(verify(rotated(), {}, fakeApksigner({
        fingerprints: [KEY.fingerprint, STOLEN.fingerprint],
      }))).rejects.toThrow(/could not choose/);
    });
  });

  it('refuses an artifact whose identity is not the one expected', async () => {
    await expect(verify(artifact({ versionCode: 1_000_000 }), { versionCode: 1_000_001 }))
      .rejects.toThrow(/does not increase/);
  });

  /**
   * An AAB used to print a warning and return successfully. Nothing here can
   * read one — the manifest is protobuf and the signing is not an installed
   * app's — so passing it was a build reporting success having checked nothing.
   */
  it('refuses an AAB rather than passing it unchecked', async () => {
    await expect(verifyBuiltArtifact({
      file: artifact({ name: 'player.aab' }),
      target: 'aab',
      repoRoot,
      signatureAuthority: fakeApksigner(),
    })).rejects.toThrow(/bundletool/);
  });
  });
});
