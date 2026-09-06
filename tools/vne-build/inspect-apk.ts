/**
 * Read a built APK and say what is actually in it.
 *
 *   pnpm inspect:apk ./player.apk
 *   pnpm inspect:apk ./player.apk --release ./novel.vnerelease
 *
 * The plan asks for things no test of the pipeline can answer, because they are
 * properties of what came out rather than of what went in: the permission list
 * of the artifact a reader installs, the identity Android will hold the story
 * to, and the key it was signed with.
 *
 * Those were checked by hand with throwaway scripts, which is how a check stops
 * happening, so they are a command. The first version of that command was too
 * weak to carry the claim: it matched permission names against the whole
 * manifest decoded as one string, and called an APK signed if the bytes
 * `APK Sig Block 42` appeared anywhere in it. Both now go through real parsers
 * ({@link ./axml}, {@link ./apk-signature}), which fail loudly on a format they
 * do not understand instead of reporting nothing and passing.
 *
 * Given `--release`, it also answers the question that matters for an update:
 * does this artifact carry the application id and version code that release
 * should have produced? EAS metadata is not a substitute — it describes what
 * was asked for, and this describes what arrived.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { unzipSync } from 'fflate';

import { readReleaseManifest } from '@/lib/release/package';
import {
  deriveAndroidIdentity,
  isSameSigningCertificate,
  normalizeSigningFingerprint,
} from '@/lib/release/native-identity';
import { runApksigner, type ApksignerVerdict } from './apksigner';
import playerProfileModule from '../../player-profile.js';
import { attribute, elementsNamed, parseBinaryXml } from './axml';
import { readApkSigning, type ApkSigning } from './apk-signature';
import { fileSource } from './stage-android';

const playerProfile = playerProfileModule as unknown as {
  PLAYER_BLOCKED_PERMISSIONS: string[];
};

/**
 * Permissions the profile blocks, the manifest asks to remove, and the artifact
 * declares anyway — each with the reason it is tolerated rather than fixed.
 *
 * Empty, and worth saying why it is empty.
 *
 * It used to hold `android.permission.DUMP`, recorded as surviving a
 * `tools:node="remove"` identical to the rule that successfully removed
 * `SYSTEM_ALERT_WINDOW` beside it — a mystery the plan carried as an open
 * question against the manifest merger. There was no mystery. The old check
 * matched permission names against the manifest decoded as one string, and
 * `DUMP` is in the string pool of all three artifacts while being declared by
 * none of them: `aapt` does not collect pool entries whose element the merger
 * removed. The removal rule always worked, and the exception excused a
 * permission that was never there.
 *
 * The mechanism stays because a genuinely unremovable permission is a thing
 * that can happen. It stays empty until one is demonstrated against a parsed
 * manifest — the evidence that was missing the first time.
 */
export const KNOWN_UNREMOVABLE_PERMISSIONS: Record<string, string> = {};

/** What the artifact must match. Every field is optional; each given one is checked. */
export interface ExpectedIdentity {
  applicationId?: string;
  versionCode?: number;
  versionName?: string;
  /** A SHA-256 certificate fingerprint, in any of the spellings keytool prints. */
  certificateFingerprint?: string;
}

export interface ApkReport {
  file: string;
  bytes: number;
  applicationId: string | null;
  versionCode: number | null;
  versionName: string | null;
  /** Declared by `uses-sdk`; decides whether a v1 signature is required. */
  minSdkVersion: number | null;
  signing: ApkSigning;
  permissions: string[];
  /** Blocked, declared, and not a known exception. Any of these is a failure. */
  leaked: string[];
  /** Blocked, declared, and acknowledged. */
  tolerated: string[];
  mediaEntries: number;
  mediaBytes: number;
  nativeAbis: string[];
  /**
   * Everything that makes this artifact unfit to hand a reader. Empty means the
   * checks ran and found nothing — never that they were skipped, because
   * anything unreadable throws rather than landing here.
   */
  problems: string[];
}

/**
 * Permissions as *declared*, not as mentioned.
 *
 * `uses-permission` and `uses-permission-sdk-23` both grant; a name that only
 * appears in the string pool grants nothing and used to count.
 */
function declaredPermissions(manifest: Uint8Array): string[] {
  const root = parseBinaryXml(manifest);
  if (root.name !== 'manifest') {
    throw new Error(`AndroidManifest.xml has <${root.name}> at its root, not <manifest>.`);
  }
  const names: string[] = [];
  for (const element of [
    ...elementsNamed(root, 'uses-permission'),
    ...elementsNamed(root, 'uses-permission-sdk-23'),
  ]) {
    const value = attribute(element, 'name')?.value;
    // A grant whose name is a resource reference or an integer is a grant this
    // cannot read, and dropping it would report an artifact as clean because
    // the one permission it could not name was the one that mattered.
    if (typeof value !== 'string') {
      throw new Error(`AndroidManifest.xml declares a permission whose name is ${JSON.stringify(value ?? null)}.`);
    }
    names.push(value);
  }
  return [...new Set(names)].sort();
}

function manifestIdentity(manifest: Uint8Array): {
  applicationId: string | null;
  versionCode: number | null;
  versionName: string | null;
  minSdkVersion: number | null;
} {
  const root = parseBinaryXml(manifest);
  const packageName = attribute(root, 'package')?.value;
  const versionCode = attribute(root, 'versionCode')?.value;
  const versionName = attribute(root, 'versionName')?.value;
  // Read because apksigner's verdict depends on it: a v1 JAR signature is
  // required below API 24 and not above, so this is part of the question rather
  // than a detail.
  const minSdkVersion = elementsNamed(root, 'uses-sdk')
    .map((element) => attribute(element, 'minSdkVersion')?.value)
    .find((value) => typeof value === 'number');
  return {
    applicationId: typeof packageName === 'string' ? packageName : null,
    versionCode: typeof versionCode === 'number' ? versionCode : null,
    versionName: typeof versionName === 'string' ? versionName : null,
    minSdkVersion: typeof minSdkVersion === 'number' ? minSdkVersion : null,
  };
}

export function inspectApk(file: string, expected: ExpectedIdentity = {}): ApkReport {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const entries = unzipSync(bytes);
  const names = Object.keys(entries);

  const manifest = entries['AndroidManifest.xml'];
  if (!manifest) throw new Error(`${file} has no AndroidManifest.xml — not an APK.`);

  const permissions = declaredPermissions(manifest);
  const identity = manifestIdentity(manifest);
  const signing = readApkSigning(bytes);

  const blocked = new Set(playerProfile.PLAYER_BLOCKED_PERMISSIONS);
  const present = permissions.filter((permission) => blocked.has(permission));
  const leaked = present.filter((permission) => !(permission in KNOWN_UNREMOVABLE_PERMISSIONS));
  const tolerated = present.filter((permission) => permission in KNOWN_UNREMOVABLE_PERMISSIONS);

  // Media lands under `res/` on Android with minified names, not `assets/`.
  const media = names.filter((name) => /^res\/[^/]+\.(png|jpe?g|webp|gif|mp3|wav|m4a|aac|ogg|mp4|webm)$/i.test(name));

  const problems: string[] = [];
  for (const permission of leaked) {
    problems.push(`Declares ${permission}, which the player profile blocks.`);
  }
  // Nothing about the signature is decided here. `apksigner` is the authority
  // and this function does not run it, so judging on the local reader alone
  // produced a verdict that ignored the tool -- which is how the "unsupported,
  // defer to apksigner" case became unreachable: an artifact this reader could
  // not judge failed here before anyone asked the one that could.
  // {@link signatureProblems} decides, once, where both answers are in hand.
  if (expected.applicationId && identity.applicationId !== expected.applicationId) {
    problems.push(
      `Application id is ${identity.applicationId ?? 'absent'}, expected ${expected.applicationId}. `
      + 'An update only installs over a matching id.',
    );
  }
  if (expected.versionCode !== undefined && identity.versionCode !== expected.versionCode) {
    problems.push(
      `Version code is ${identity.versionCode ?? 'absent'}, expected ${expected.versionCode}. `
      + 'Android refuses an update whose code does not increase.',
    );
  }
  if (expected.versionName && identity.versionName !== expected.versionName) {
    problems.push(`Version name is ${identity.versionName ?? 'absent'}, expected ${expected.versionName}.`);
  }
  if (expected.certificateFingerprint !== undefined
    && normalizeSigningFingerprint(expected.certificateFingerprint) === null) {
    problems.push(`${expected.certificateFingerprint} is not a SHA-256 certificate fingerprint.`);
  }

  return {
    file,
    bytes: bytes.length,
    ...identity,
    signing,
    permissions,
    leaked,
    tolerated,
    mediaEntries: media.length,
    mediaBytes: media.reduce((total, name) => total + entries[name].length, 0),
    nativeAbis: [...new Set(names
      .filter((name) => name.startsWith('lib/'))
      .map((name) => name.split('/')[1]))].sort(),
    problems,
  };
}

/**
 * The signer this artifact is to be held to.
 *
 * The local reader's answer when it has one, and apksigner's when it does not
 * -- which is the case that made the whole "unsupported" state pointless
 * before: the record was written from a fingerprint that was `null` exactly
 * when the local reader had abstained.
 *
 * apksigner naming more than one signer is refused rather than reduced to the
 * first. Which of several a device holds an app to depends on the schemes
 * involved, and guessing here would pin a story to a key on a coin toss.
 */
export function effectiveFingerprint(
  report: ApkReport,
  authority: ApksignerVerdict,
): { fingerprint: string | null; problem: string | null } {
  if (report.signing.certificateFingerprint) {
    return { fingerprint: report.signing.certificateFingerprint, problem: null };
  }
  if (authority.fingerprints.length === 1) return { fingerprint: authority.fingerprints[0], problem: null };
  if (authority.fingerprints.length === 0) {
    return { fingerprint: null, problem: 'Neither reader could name the signing certificate.' };
  }
  return {
    fingerprint: null,
    problem: `apksigner names ${authority.fingerprints.length} signers `
      + `(${authority.fingerprints.join(', ')}) and this reader could not choose between them.`,
  };
}

/**
 * Everything wrong with the signature, decided once, with both answers present.
 *
 * `apksigner` is the authority. The local reader is a second opinion, and the
 * only thing it may do on its own is fail the artifact when the two disagree.
 * Where it says outright that it does not implement something, apksigner's
 * verdict stands alone -- but the artifact still has to be held to a key, which
 * is what {@link effectiveFingerprint} is for.
 */
export function signatureProblems(
  report: ApkReport,
  authority: ApksignerVerdict,
  expectedFingerprint?: string,
): string[] {
  const problems: string[] = [];
  if (!authority.verifies) {
    return [`apksigner does not verify this artifact:\n${authority.output
      .split(/\r?\n/).map((line) => `    ${line}`).join('\n')}`];
  }

  const signing = report.signing;
  if (!signing.verified && !signing.unsupported) {
    return [
      `apksigner verifies this artifact and this repository's own reader does not: ${signing.problem}. `
      + 'One of the two is wrong, and neither may be assumed to be the tool.',
    ];
  }

  const effective = effectiveFingerprint(report, authority);
  if (effective.problem) problems.push(effective.problem);
  if (
    effective.fingerprint
    && authority.fingerprints.length > 0
    && !authority.fingerprints.includes(effective.fingerprint)
  ) {
    problems.push(
      `apksigner reports the signer as ${authority.fingerprints.join(', ')} `
      + `and this reader reports ${effective.fingerprint}.`,
    );
  }

  const wanted = normalizeSigningFingerprint(expectedFingerprint);
  if (wanted && effective.fingerprint && !isSameSigningCertificate(effective.fingerprint, wanted)) {
    problems.push(
      `Signed by ${effective.fingerprint}, expected ${wanted}. `
      + 'A different key means readers must uninstall, losing their saves.',
    );
  }
  return problems;
}

/**
 * What the release under `--release` should have produced.
 *
 * Derived through the same call staging makes, so this cannot drift into
 * agreeing with a wrong answer.
 */
export async function expectedFromRelease(releaseFile: string): Promise<ExpectedIdentity> {
  const manifest = await readReleaseManifest(fileSource(releaseFile));
  const identity = deriveAndroidIdentity({
    storyId: manifest.story.id,
    title: manifest.story.title,
    version: manifest.release.version,
  });
  return {
    applicationId: identity.applicationId,
    versionCode: identity.androidVersionCode,
    versionName: identity.version,
  };
}

function describeBytes(value: number): string {
  return `${(value / 1048576).toFixed(1)} MB`;
}

const color = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

/** Printed by the CLI and by `--build`, so both say the same things. */
export function printApkReport(report: ApkReport, authority?: ApksignerVerdict): void {
  console.log(`\n${path.basename(report.file)}  ${describeBytes(report.bytes)}`);
  console.log(color.dim(`  identity:     ${report.applicationId ?? '—'} `
    + `v${report.versionName ?? '?'} (code ${report.versionCode ?? '?'})`));
  const key = authority ? effectiveFingerprint(report, authority).fingerprint : report.signing.certificateFingerprint;
  if (authority?.verifies && report.signing.unsupported) {
    console.log(color.yellow(`  signed:       ${authority.schemes.join(', ')} by apksigner alone, key ${key}`));
    console.log(color.yellow(`                this reader abstained: ${report.signing.problem}`));
  } else if (authority?.verifies || (!authority && report.signing.verified)) {
    console.log(color.dim(`  signed:       ${(authority?.schemes ?? report.signing.schemes).join(', ')} verified, key ${key}`));
  } else {
    console.log(color.red(`  signed:       NOT VERIFIED — ${authority?.verifies === false
      ? 'apksigner rejected it' : report.signing.problem}`));
  }
  if (report.signing.subject) console.log(color.dim(`  certificate:  ${report.signing.subject.replace(/\n/g, ', ')}`));
  console.log(color.dim(`  media inside: ${report.mediaEntries} file(s), ${describeBytes(report.mediaBytes)}`));
  console.log(color.dim(`  native ABIs:  ${report.nativeAbis.join(', ') || 'none'}`));
  console.log(color.dim('  permissions:'));
  for (const permission of report.permissions) {
    const short = permission.replace('android.permission.', '');
    if (report.leaked.includes(permission)) console.log(color.red(`    ✖ ${short}  — blocked, but declared`));
    else if (report.tolerated.includes(permission)) console.log(color.yellow(`    ! ${short}  — ${KNOWN_UNREMOVABLE_PERMISSIONS[permission]}`));
    else console.log(color.dim(`      ${short}`));
  }

  if (report.problems.length > 0) {
    console.error(color.red(`\n✖ ${report.problems.length} problem(s):`));
    for (const problem of report.problems) console.error(color.red(`    ${problem}`));
    console.error('');
    return;
  }
  const excused = report.tolerated.length > 0 ? ', beyond the acknowledged one' : '';
  console.log(color.green(`\n✔ Signed, correctly identified, and exposing nothing blocked${excused}.\n`));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const file = argv.find((arg) => !arg.startsWith('--'));
  if (!file) {
    console.error('Usage: pnpm inspect:apk <file.apk> [--release <file.vnerelease>] [--fingerprint <SHA-256>]');
    process.exit(1);
  }
  const releaseAt = argv.indexOf('--release');
  const fingerprintAt = argv.indexOf('--fingerprint');

  const expected: ExpectedIdentity = releaseAt >= 0
    ? await expectedFromRelease(path.resolve(process.cwd(), argv[releaseAt + 1]))
    : {};
  if (fingerprintAt >= 0) expected.certificateFingerprint = argv[fingerprintAt + 1];

  const report = inspectApk(path.resolve(process.cwd(), file), expected);
  // The same authority the build path uses. A command that reported on the
  // signature without it would make a weaker claim under the same words.
  const authority = runApksigner(report.file, report.minSdkVersion ?? undefined);
  report.problems.push(...signatureProblems(report, authority, expected.certificateFingerprint));
  printApkReport(report, authority);
  if (report.problems.length > 0) process.exit(1);
}

// Only when run as a command; the inspection itself is importable and tested.
if (process.argv[1]?.endsWith('inspect-apk.ts')) void main();
