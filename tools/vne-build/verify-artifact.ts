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

import { normalizeSigningFingerprint } from '@/lib/release/native-identity';
import { expectedFromRelease, inspectApk, type ApkReport, type ExpectedIdentity } from './inspect-apk';

/** Where a story's signing certificate is remembered, keyed by application id. */
export function signingRecordFile(stateDirectory: string, applicationId: string): string {
  return path.join(stateDirectory, `${applicationId}.signing.json`);
}

interface SigningRecord {
  version: 1;
  applicationId: string;
  fingerprint: string;
  firstSeen: string;
}

export function readSigningRecord(stateDirectory: string, applicationId: string): SigningRecord | null {
  const file = signingRecordFile(stateDirectory, applicationId);
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

function writeSigningRecord(stateDirectory: string, applicationId: string, fingerprint: string): void {
  fs.mkdirSync(stateDirectory, { recursive: true });
  const record: SigningRecord = {
    version: 1,
    applicationId,
    fingerprint,
    firstSeen: new Date().toISOString(),
  };
  fs.writeFileSync(
    signingRecordFile(stateDirectory, applicationId),
    `${JSON.stringify(record, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export class UnverifiableArtifact extends Error {}

export interface VerifyOptions {
  /** The downloaded artifact. */
  file: string;
  target: 'apk' | 'aab';
  /** The release it was built from; the identity is derived from it. */
  releaseFile?: string;
  /** Or the expected identity directly, for callers that already have it. */
  expected?: ExpectedIdentity;
  /** Where signing records live. */
  stateDirectory: string;
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

  const remembered = readSigningRecord(options.stateDirectory, applicationId);
  const report = remembered
    ? inspectApk(options.file, { ...expected, certificateFingerprint: remembered.fingerprint })
    : first;

  if (report.problems.length > 0) {
    throw new UnverifiableArtifact(
      `${path.basename(options.file)} is not fit to hand a reader:\n`
      + report.problems.map((problem) => `  • ${problem}`).join('\n'),
    );
  }

  if (remembered) {
    log(`Signing key matches the one recorded for ${applicationId}`);
  } else if (report.signing.certificateFingerprint) {
    // Only after everything else passed: a record minted from a bad artifact
    // would pin the story to the wrong key for the rest of its life.
    writeSigningRecord(options.stateDirectory, applicationId, report.signing.certificateFingerprint);
    log(`Recorded the signing key for ${applicationId}; later builds are checked against it`);
  }
  return report;
}
