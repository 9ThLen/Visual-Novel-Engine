/**
 * The child process the race tests spawn.
 *
 * It lives in the repository rather than being written into a temp directory at
 * test time, because a script outside the tree does not get the tsconfig path
 * aliases and cannot import what it is meant to exercise. Being a real file
 * also means it typechecks with everything else.
 *
 *   tsx race-worker.ts replace <target> <marker>
 *   tsx race-worker.ts record  <repoRoot> <outDir>
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { zipSync } from 'fflate';

import { pendingPath, replaceFile, verifyBuiltArtifact } from '../../tools/vne-build/verify-artifact';
import { fakeManifest } from './android-manifest';
import { fakeApksigner } from './fake-apksigner';
import { makeSigningKey, signApk } from './apk-signing';

const RACE_APPLICATION_ID = 'com.vne.story.race.s1';

function replace(target: string, marker: string): void {
  for (let round = 0; round < 25; round += 1) {
    const incoming = pendingPath(target);
    fs.writeFileSync(incoming, `${marker}-${round}`);
    replaceFile(incoming, target);
    // Read straight back: the window this is about is the one where somebody
    // looking for the artifact finds nothing there.
    if (!fs.existsSync(target)) {
      console.error(`MISSING after round ${round}`);
      process.exit(2);
    }
  }
  console.log(`DONE ${marker}`);
}

async function record(repoRoot: string, outDirectory: string): Promise<void> {
  const key = makeSigningKey(`Racer ${process.pid}`);
  const file = path.join(outDirectory, `player-${process.pid}.apk`);
  fs.writeFileSync(file, signApk(zipSync({
    'AndroidManifest.xml': fakeManifest({
      applicationId: RACE_APPLICATION_ID,
      versionCode: 1_000_000,
    }),
    'classes.dex': new Uint8Array([1, 2, 3]),
  }), key));

  try {
    await verifyBuiltArtifact({
      file,
      target: 'apk',
      expected: { applicationId: RACE_APPLICATION_ID },
      repoRoot,
      // The race is about the record, not the signature, and the child must run
      // on a machine without the Android SDK like everything else here.
      signatureAuthority: fakeApksigner({ fingerprints: [key.fingerprint] }),
    });
    console.log(`ACCEPTED ${key.fingerprint}`);
  } catch (error) {
    console.log(`REFUSED ${error instanceof Error ? error.message : String(error)}`);
    process.exit(3);
  }
}

const [mode, first, second] = process.argv.slice(2);
if (mode === 'replace') replace(first, second);
else if (mode === 'record') void record(first, second);
else {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}
