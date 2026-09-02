/**
 * Read a built APK and say what is actually in it.
 *
 *   pnpm inspect:apk ./player.apk
 *
 * The plan asks for one thing no test can answer: the permission list of the
 * artifact a reader installs. That was checked three times by hand with
 * throwaway scripts, which is how a check stops happening. This is the same
 * questions, committed.
 *
 * It reports, and it *fails* when the artifact carries a permission the player
 * profile declared must not be in it — a report nobody can fail is a report
 * nobody reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { unzipSync } from 'fflate';

import playerProfileModule from '../../player-profile.js';

const playerProfile = playerProfileModule as unknown as {
  PLAYER_BLOCKED_PERMISSIONS: string[];
};

/**
 * Permissions the profile blocks, the manifest asks to remove, and the artifact
 * has anyway.
 *
 * `android.permission.DUMP` survives a `tools:node="remove"` that is character
 * for character the rule which successfully removes `SYSTEM_ALERT_WINDOW` two
 * lines below it in the same generated manifest. Why the manifest merger treats
 * them differently is unanswered — the merger report is a file on the build
 * machine, and Gradle does not print the reasoning.
 *
 * Listed rather than quietly filtered, with the reason, so that it is an
 * acknowledged exception instead of a check that silently means less than it
 * says. `DUMP` is signature-level, so no ordinary app is granted it.
 */
export const KNOWN_UNREMOVABLE_PERMISSIONS: Record<string, string> = {
  'android.permission.DUMP':
    'survives its own tools:node="remove"; signature-level, so never granted. '
    + 'See RELEASE-PLAN.md R9.',
};

export interface ApkReport {
  file: string;
  bytes: number;
  signed: boolean;
  permissions: string[];
  /** Blocked, present, and not a known exception. Any of these is a failure. */
  leaked: string[];
  /** Blocked, present, and acknowledged. */
  tolerated: string[];
  mediaEntries: number;
  mediaBytes: number;
  nativeAbis: string[];
}

/**
 * Permission names as they appear in the binary manifest's string pool.
 *
 * A string scan rather than an AXML parse. It cannot describe *how* a permission
 * is declared, which is the question this tool does not need to answer — and it
 * has been checked against reality: it reported `SYSTEM_ALERT_WINDOW` before the
 * block and not after, on two artifacts that differ only by that block.
 */
function permissionsFromManifest(manifest: Uint8Array): string[] {
  // `TextDecoder`, not `Buffer`: the ambient Buffer in this project is React
  // Native's shim and has `from` and nothing else.
  const text = new TextDecoder('utf-16le').decode(manifest);
  return [...new Set(text.match(/android\.permission\.[A-Z_]+/g) ?? [])].sort();
}

/** Whether `haystack` contains `needle`, without decoding 170 MB to a string. */
function containsBytes(haystack: Uint8Array, needle: string): boolean {
  const pattern = new TextEncoder().encode(needle);
  outer: for (let start = 0; start <= haystack.length - pattern.length; start += 1) {
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (haystack[start + offset] !== pattern[offset]) continue outer;
    }
    return true;
  }
  return false;
}

export function inspectApk(file: string): ApkReport {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const entries = unzipSync(bytes);
  const names = Object.keys(entries);

  const manifest = entries['AndroidManifest.xml'];
  if (!manifest) throw new Error(`${file} has no AndroidManifest.xml — not an APK.`);

  const permissions = permissionsFromManifest(manifest);
  const blocked = new Set(playerProfile.PLAYER_BLOCKED_PERMISSIONS);
  const present = permissions.filter((permission) => blocked.has(permission));

  // Media lands under `res/` on Android with minified names, not `assets/`.
  const media = names.filter((name) => /^res\/[^/]+\.(png|jpe?g|webp|gif|mp3|wav|m4a|aac|ogg|mp4|webm)$/i.test(name));

  return {
    file,
    bytes: bytes.length,
    // v2+ signatures live in the signing block, which is outside the zip entries;
    // a v1 signature is a file. Either way an unsigned APK has neither.
    signed: names.some((name) => /^META-INF\/.*\.(RSA|EC|DSA)$/i.test(name))
      || containsBytes(bytes, 'APK Sig Block 42'),
    permissions,
    leaked: present.filter((permission) => !(permission in KNOWN_UNREMOVABLE_PERMISSIONS)),
    tolerated: present.filter((permission) => permission in KNOWN_UNREMOVABLE_PERMISSIONS),
    mediaEntries: media.length,
    mediaBytes: media.reduce((total, name) => total + entries[name].length, 0),
    nativeAbis: [...new Set(names
      .filter((name) => name.startsWith('lib/'))
      .map((name) => name.split('/')[1]))].sort(),
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

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: pnpm inspect:apk <file.apk>');
    process.exit(1);
  }

  const report = inspectApk(path.resolve(process.cwd(), file));
  console.log(`\n${path.basename(report.file)}  ${describeBytes(report.bytes)}  `
    + `${report.signed ? color.green('signed') : color.red('UNSIGNED')}`);
  console.log(color.dim(`  media inside: ${report.mediaEntries} file(s), ${describeBytes(report.mediaBytes)}`));
  console.log(color.dim(`  native ABIs:  ${report.nativeAbis.join(', ') || 'none'}`));
  console.log(color.dim('  permissions:'));
  for (const permission of report.permissions) {
    const short = permission.replace('android.permission.', '');
    if (report.leaked.includes(permission)) console.log(color.red(`    ✖ ${short}  — blocked, but present`));
    else if (report.tolerated.includes(permission)) console.log(color.yellow(`    ! ${short}  — ${KNOWN_UNREMOVABLE_PERMISSIONS[permission]}`));
    else console.log(color.dim(`      ${short}`));
  }

  if (report.leaked.length > 0) {
    console.error(color.red(`\n✖ ${report.leaked.length} blocked permission(s) reached the artifact.\n`));
    process.exit(1);
  }
  console.log(color.green('\n✔ No blocked permission reached the artifact, beyond the acknowledged one.\n'));
}

// Only when run as a command; the inspection itself is importable and tested.
if (process.argv[1]?.endsWith('inspect-apk.ts')) main();
