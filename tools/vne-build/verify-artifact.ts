/**
 * The check every finished build goes through, whoever asked for it.
 *
 * It was optional, and so it happened in one of the two places. The command
 * line read the APK it downloaded; the helper the browser drives returned the
 * file with the server checking only that it was a well-formed zip. An author
 * clicking Release could therefore be handed an artifact whose permissions and
 * identity nobody had looked at — the exact failure the verifier was written to
 * prevent, reachable by the exact route most authors take.
 *
 * So verification lives here and both callers go through it. It throws rather
 * than reporting: a builder that returns an artifact it could not vouch for is
 * a builder whose success means nothing.
 *
 * It also owns the answer to "is this the same key as last time", which needs
 * something remembered. The first verified build of a story records its signing
 * certificate; every later one is checked against that record. Trust on first
 * use, which is what Android itself does — it pins an app to whatever key
 * signed the install it already has.
 */
import fs from 'node:fs';
import path from 'node:path';

import { isSameSigningCertificate, normalizeSigningFingerprint } from '@/lib/release/native-identity';
import { runApksigner, type ApksignerVerdict } from './apksigner';
import {
  effectiveFingerprint,
  expectedFromRelease,
  inspectApk,
  signatureProblems,
  type ApkReport,
  type ExpectedIdentity,
} from './inspect-apk';

/**
 * Where signing records live, derived rather than passed.
 *
 * It used to be a parameter, and the two callers gave it different values: the
 * command line kept records in `.vne-builds/`, and the helper -- which puts its
 * own job state under a `--work-dir` -- kept them in
 * `.vne-builds/eas-identities/`. So building once from the app and once from
 * the terminal meant two first builds, and the second key to arrive was
 * recorded as though nothing had been seen before. A check against a
 * remembered value is worth exactly as much as the agreement on where the value
 * is remembered, so this is no longer something a caller can choose.
 */
export function signingStateDirectory(repoRoot: string): string {
  return path.join(repoRoot, '.vne-builds', 'signing');
}

/** A story's signing record, keyed by the application id Android holds it to. */
export function signingRecordFile(repoRoot: string, applicationId: string): string {
  return path.join(signingStateDirectory(repoRoot), `${applicationId}.signing.json`);
}

/**
 * The two places records were written before they were written in one place.
 *
 * Moving the location without reading these would have quietly undone the fix
 * it was part of: a story with a key already recorded would come back from an
 * update looking like it had never been built, and the next artifact -- any
 * artifact -- would be accepted as its first.
 */
function legacyRecordFiles(
  repoRoot: string,
  applicationId: string,
  extra: string[] = [],
): string[] {
  return [
    path.join(repoRoot, '.vne-builds', `${applicationId}.signing.json`),
    path.join(repoRoot, '.vne-builds', 'eas-identities', `${applicationId}.signing.json`),
    // The helper's state directory follows its `--work-dir`, which can be
    // anywhere; the two above are only where it lands by default. A caller that
    // knows it kept records elsewhere says so, or the histories furthest from
    // the default are exactly the ones a move would lose.
    ...extra.map((directory) => path.join(directory, `${applicationId}.signing.json`)),
  ];
}

interface SigningRecord {
  version: 1;
  applicationId: string;
  fingerprint: string;
  firstSeen: string;
}

function readRecordFile(file: string, applicationId: string): SigningRecord | null {
  if (!fs.existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`The signing record for ${applicationId} is unreadable: ${file}`);
  }
  const record = raw as Partial<SigningRecord> | null;
  const fingerprint = normalizeSigningFingerprint(record?.fingerprint);
  if (!record || record.version !== 1 || record.applicationId !== applicationId || !fingerprint) {
    // Refused rather than replaced: a damaged record is indistinguishable from
    // a tampered one, and quietly minting a new one would turn "the key
    // changed" into "there was never a key".
    throw new Error(`The signing record for ${applicationId} is invalid: ${file}`);
  }
  return { version: 1, applicationId, fingerprint, firstSeen: String(record.firstSeen ?? '') };
}

/**
 * A story's remembered key, wherever a past version of this put it.
 *
 * Records found in an old location are carried forward on the way past. If two
 * of them disagree the answer is a refusal rather than a choice: the machine
 * has accepted two keys for one story already, and picking one here would hide
 * that rather than settle it.
 */
export function readSigningRecord(
  repoRoot: string,
  applicationId: string,
  legacyStateDirectories: string[] = [],
): SigningRecord | null {
  const current = signingRecordFile(repoRoot, applicationId);
  const found = [current, ...legacyRecordFiles(repoRoot, applicationId, legacyStateDirectories)]
    .map((file) => ({ file, record: readRecordFile(file, applicationId) }))
    .filter((entry): entry is { file: string; record: SigningRecord } => entry.record !== null);
  if (found.length === 0) return null;

  const fingerprints = [...new Set(found.map((entry) => entry.record.fingerprint))];
  if (fingerprints.length > 1) {
    throw new Error(
      `${applicationId} has signing records naming ${fingerprints.length} different keys:\n`
      + found.map((entry) => `  ${entry.record.fingerprint}  ${entry.file}`).join('\n')
      + '\nOnly one can be the key this story is installed under. Remove the others once you know which.',
    );
  }

  const record = found[0].record;
  if (found[0].file !== current) {
    fs.mkdirSync(path.dirname(current), { recursive: true });
    try {
      fs.writeFileSync(current, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  return record;
}

/**
 * Record a story's key, once.
 *
 * Exclusive creation, and on collision a re-read rather than a retry: two
 * builds of the same story can finish together, and a plain write let each of
 * them find no record, accept its own artifact, and overwrite the other. The
 * loser of that race decided which key the story was pinned to, which is the
 * one thing this file exists to make impossible.
 *
 * A record that already exists and names a different key is a failure, not
 * something to replace -- by then two artifacts signed by different keys have
 * both been accepted, and the honest answer is to say so.
 */
function recordSigningKey(repoRoot: string, applicationId: string, fingerprint: string): void {
  const file = signingRecordFile(repoRoot, applicationId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record: SigningRecord = {
    version: 1,
    applicationId,
    fingerprint,
    firstSeen: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  const existing = readSigningRecord(repoRoot, applicationId);
  if (!existing || !isSameSigningCertificate(existing.fingerprint, fingerprint)) {
    throw new UnverifiableArtifact(
      `Another build recorded ${existing?.fingerprint ?? 'a different key'} for ${applicationId} `
      + `while this one was being checked, and this artifact is signed by ${fingerprint}. `
      + 'Two keys cannot both be the first; work out which is the story\'s and remove the other build.',
    );
  }
}

export class UnverifiableArtifact extends Error {}

/**
 * Hold the right to replace one path, or fail.
 *
 * Exclusive creation is the lock. Without one, two processes replacing the same
 * destination interleave: one steps the incumbent aside while the other deletes
 * that copy or restores from it, and the artifact that survives is whichever
 * lost the race -- or none.
 *
 * A lock left by a process that died is taken over after it goes stale, because
 * the alternative is a build that can never run again after one crash.
 */
const LOCK_STALE_MS = 60_000;
const LOCK_ATTEMPTS = 50;

interface Lock { file: string; token: string }

function pause(milliseconds: number): void {
  // Busy-wait rather than await: every caller is already inside a synchronous
  // replace, and the hold is a rename or two.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function holderIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0 asks about the process without touching it
    return true;
  } catch (error) {
    // EPERM means it exists and belongs to somebody else, which is still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Take the right to replace one path, and be able to prove it later.
 *
 * The first version took a lock over by age alone. A process suspended for a
 * minute -- a laptop lid, a long GC, a debugger -- would find its lock stolen
 * while it was still inside the critical section, and on waking would delete
 * the thief's lock on its way out, handing the section to a third. So age is
 * not enough on its own: the holder has to be gone as well, and the file
 * carries a token so nobody removes a lock that is not theirs.
 */
function acquireLock(target: string): Lock {
  const file = `${target}.lock`;
  // Dot-separated, not colon: the token becomes part of a filename when an
  // abandoned lock is claimed, and a colon is illegal in one on Windows -- the
  // rename failed silently, the takeover never happened, and the wait ran out.
  const token = `${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      fs.writeFileSync(file, `${token}\n`, { flag: 'wx' });
      return { file, token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

      let held: string;
      let age: number;
      try {
        held = fs.readFileSync(file, 'utf8').trim();
        age = Date.now() - fs.statSync(file).mtimeMs;
      } catch {
        continue; // it went away between the two calls; try for it
      }

      const pid = Number.parseInt(held.split('.')[0], 10);
      if (age > LOCK_STALE_MS && !holderIsAlive(pid)) {
        // Claim by rename rather than delete-then-create: two processes
        // clearing the same abandoned lock cannot both succeed at a rename.
        try {
          fs.renameSync(file, `${file}.stale.${token}`);
          fs.rmSync(`${file}.stale.${token}`, { force: true });
        } catch {
          // Somebody else got there first, which is fine.
        }
        continue;
      }
      pause(100);
    }
  }
  throw new Error(`Another process is still replacing ${path.basename(target)} (${file}).`);
}

/** Release a lock only if it is still the one taken here. */
function releaseLock(lock: Lock): void {
  try {
    if (fs.readFileSync(lock.file, 'utf8').trim() !== lock.token) return;
  } catch {
    return; // already gone
  }
  fs.rmSync(lock.file, { force: true });
}

/**
 * Move `from` onto `to` without a moment where neither exists.
 *
 * An earlier version deleted the destination and then renamed, which loses the
 * last good artifact if anything fails between the two -- and `rename` cannot
 * simply overwrite on Windows, which is why the delete was there. The incumbent
 * is stepped aside under a name of this process's own and removed only once the
 * new file is in place, so a crash leaves one artifact or the other and never
 * neither.
 */
export function replaceFile(from: string, to: string): void {
  const lock = acquireLock(to);
  try {
    if (!fs.existsSync(to)) {
      fs.renameSync(from, to);
      return;
    }
    const previous = pendingPath(`${to}.previous`);
    fs.renameSync(to, previous);
    try {
      fs.renameSync(from, to);
    } catch (error) {
      fs.renameSync(previous, to); // put back what was there
      throw error;
    }
    fs.rmSync(previous, { force: true });
  } finally {
    releaseLock(lock);
  }
}

/** A scratch name no concurrent run of this can collide with. */
export function pendingPath(target: string): string {
  return `${target}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.part`;
}


export interface VerifyOptions {
  /** The downloaded artifact. */
  file: string;
  target: 'apk' | 'aab';
  /** The release it was built from; the identity is derived from it. */
  releaseFile?: string;
  /** Or the expected identity directly, for callers that already have it. */
  expected?: ExpectedIdentity;
  /**
   * The engine repository. Signing records hang off it, so both callers reach
   * the same ones without either naming a path.
   */
  repoRoot: string;
  /**
   * Directories a caller has kept records in besides the standard ones -- the
   * helper's `--work-dir`, which can be anywhere. Without these, moving to one
   * location loses exactly the histories that were furthest from the default.
   */
  legacyStateDirectories?: string[];
  /** Injected so the suite can run on a machine without the Android SDK. */
  signatureAuthority?: (file: string, minSdkVersion?: number) => ApksignerVerdict;
  onLog?: (line: string) => void;
}

/**
 * Verify an artifact, or throw.
 *
 * An AAB throws rather than passing. It is a different container whose manifest
 * is protobuf rather than binary XML, and it is not signed the way an installed
 * APK is, so none of the checks below apply to it. Letting it through with a
 * printed warning — which is what happened before — meant a build could exit
 * successfully having verified nothing, which is worse than refusing: the
 * contract here is that success means checked.
 */
export async function verifyBuiltArtifact(options: VerifyOptions): Promise<ApkReport> {
  const log = options.onLog ?? (() => {});

  if (options.target !== 'apk') {
    throw new UnverifiableArtifact(
      `${path.basename(options.file)} is an AAB, which nothing here can verify: its manifest is `
      + 'protobuf and its signing is not an installed app\'s. Checking one needs bundletool. '
      + 'The file is on disk; this build is not certified. See RELEASE-PLAN.md R9.',
    );
  }

  const expected: ExpectedIdentity = options.expected
    ?? (options.releaseFile ? await expectedFromRelease(options.releaseFile) : {});

  // Read the identity first, so the stored record can be found before the
  // artifact is judged against it.
  const first = inspectApk(options.file, expected);
  const applicationId = first.applicationId;
  if (!applicationId) {
    throw new UnverifiableArtifact(`${path.basename(options.file)} declares no application id.`);
  }

  const remembered = readSigningRecord(options.repoRoot, applicationId, options.legacyStateDirectories);
  const report = first;

  // The authority on the signature, and required rather than preferred. The
  // local implementation has been found short four times; the tool Android
  // ships is what a device's behaviour is defined against.
  const authority = (options.signatureAuthority ?? runApksigner)(
    options.file,
    report.minSdkVersion ?? undefined,
  );
  report.problems.push(...signatureProblems(report, authority, remembered?.fingerprint));

  if (report.problems.length > 0) {
    throw new UnverifiableArtifact(
      `${path.basename(options.file)} is not fit to hand a reader:\n`
      + report.problems.map((problem) => `  • ${problem}`).join('\n'),
    );
  }

  if (report.signing.unsupported) {
    log(`Signature accepted on apksigner's verdict alone: ${report.signing.problem}`);
  }
  log(`Signature verified by ${authority.tool} (${authority.schemes.join(', ') || 'no scheme'})`);

  const signer = effectiveFingerprint(report, authority).fingerprint;
  if (remembered) {
    log(`Signing key matches the one recorded for ${applicationId}`);
  } else if (signer) {
    // Only after everything else passed: a record minted from a bad artifact
    // would pin the story to the wrong key for the rest of its life. The
    // fingerprint is the effective one, so an artifact the local reader
    // abstained on is still recorded -- under apksigner's answer.
    recordSigningKey(options.repoRoot, applicationId, signer);
    log(`Recorded the signing key for ${applicationId}; later builds are checked against it`);
  }
  return report;
}
