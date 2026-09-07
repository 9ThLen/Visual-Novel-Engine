/**
 * The authority on whether an APK's signature holds.
 *
 * `apk-signature.ts` implements enough of the v2 and v3 schemes to check a
 * signature, and each round of review has found another thing it did not
 * implement: v3 read with the v2 layout, only the first scheme checked, only
 * the first signer compared, an SDK range copied into the signed data and never
 * compared to the one outside it. Every one of those was a check that read as
 * stronger than it was, which is the failure mode this whole area keeps
 * repeating.
 *
 * At some point the right move is to stop reimplementing and call the program
 * Android ships for exactly this. `apksigner` is that program: it knows the
 * schemes, the rotation lineage, the source stamps and the platform's rules
 * about which scheme governs which SDK level, and it is what a device's
 * behaviour is defined against.
 *
 * So it is required, not preferred. A machine without it cannot certify a
 * build — which is a real cost, and smaller than the cost of a "verified" that
 * means "the parts we got round to implementing agreed".
 *
 * The local implementation stays as a second opinion. Two implementations that
 * disagree is itself a finding, and the one place it is allowed to be quiet is
 * where it knows it does not support something.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

export interface ApksignerVerdict {
  /** The path that was run, for a report to name. */
  tool: string;
  verifies: boolean;
  /** Schemes it reports as verifying, e.g. `['v2']`. */
  schemes: string[];
  /** Every signer certificate it printed, as `AB:CD:…`. */
  fingerprints: string[];
  output: string;
}

export class ApksignerMissing extends Error {}

/** The first line of whatever a failing invocation had to say for itself. */
function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0] ?? '';
}

/**
 * How to start apksigner: the jar under a real `java`, or the wrapper itself.
 *
 * The jar is preferred wherever it exists, and the reason is Windows. There
 * `apksigner` is a `.bat`, which Node has refused to spawn without a shell
 * since CVE-2024-27980 -- and putting a shell in the way means quoting a file
 * path that is chosen by whoever runs the build. `java.exe` is a real
 * executable, so the argument list stays an argument list.
 */
type Invocation = { command: string; prefix: string[]; label: string };

function javaExecutable(): string {
  const name = process.platform === 'win32' ? 'java.exe' : 'java';
  const home = process.env.JAVA_HOME;
  if (home) {
    const candidate = path.join(home, 'bin', name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return name; // resolved from PATH, and a real executable either way
}

function invocationIn(directory: string): Invocation | null {
  const jar = path.join(directory, 'lib', 'apksigner.jar');
  if (fs.existsSync(jar)) {
    return { command: javaExecutable(), prefix: ['-jar', jar], label: jar };
  }
  for (const name of process.platform === 'win32' ? ['apksigner.bat', 'apksigner'] : ['apksigner']) {
    const candidate = path.join(directory, name);
    if (fs.existsSync(candidate)) return { command: candidate, prefix: [], label: candidate };
  }
  return null;
}

/** Build-tools directories, newest first, by their version-shaped names. */
function buildToolsIn(sdk: string): string[] {
  const root = path.join(sdk, 'build-tools');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => /^\d+(\.\d+)*/.test(name))
    .sort((a, b) => {
      const left = a.split('.').map(Number);
      const right = b.split('.').map(Number);
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const difference = (right[index] ?? 0) - (left[index] ?? 0);
        if (difference !== 0) return difference;
      }
      return 0;
    })
    .map((name) => path.join(root, name));
}

function defaultSdkRoot(): string | null {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null;
  }
  if (!process.env.HOME) return null;
  return process.platform === 'darwin'
    ? path.join(process.env.HOME, 'Library', 'Android', 'sdk')
    : path.join(process.env.HOME, 'Android', 'Sdk');
}

/**
 * Find apksigner, in the order someone would look for it themselves.
 *
 * `APKSIGNER` first, so a machine with an unusual layout -- or a test -- can say
 * where it is rather than leaving this to guess.
 */
export function findApksigner(): Invocation | null {
  const named = process.env.APKSIGNER;
  if (named) {
    if (!fs.existsSync(named)) return null;
    return named.endsWith('.jar')
      ? { command: javaExecutable(), prefix: ['-jar', named], label: named }
      : { command: named, prefix: [], label: named };
  }

  const roots = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME, defaultSdkRoot()]
    .filter((value): value is string => Boolean(value));
  for (const root of roots) {
    for (const directory of buildToolsIn(root)) {
      const found = invocationIn(directory);
      if (found) return found;
    }
  }
  return null;
}

const FINGERPRINT = /certificate SHA-256 digest:\s*([0-9a-fA-F]{64})/g;
const SCHEME = /Verified using (v[\d.]+) scheme[^:]*:\s*(true|false)/g;

export function parseApksignerOutput(tool: string, output: string, status: number): ApksignerVerdict {
  const schemes: string[] = [];
  for (const match of output.matchAll(SCHEME)) {
    if (match[2] === 'true') schemes.push(match[1]);
  }
  const fingerprints = [...new Set([...output.matchAll(FINGERPRINT)]
    .map((match) => (match[1].toUpperCase().match(/../g) as string[]).join(':')))];

  // The exit code is the verdict; the word is a courtesy. Both are required to
  // agree, because a parser that trusts only the text would call a crash a pass.
  return {
    tool,
    verifies: status === 0 && /^Verifies\b/m.test(output),
    schemes,
    fingerprints,
    output: output.trim(),
  };
}

/**
 * Run `apksigner verify` over a file.
 *
 * `minSdkVersion` comes from the artifact's own manifest, which is the same
 * thing apksigner would work out for itself and the same thing a device uses.
 * Passing it explicitly matters because the answer changes with it -- below
 * API 24 a v1 JAR signature is required and above it is not -- so leaving
 * apksigner to guess makes the verdict depend on how well it can read a
 * manifest this repository has already parsed.
 */
/**
 * Whether a signature could be verified at all on this machine, and why not.
 *
 * Asked before a build is submitted, not after it comes back. Discovering that
 * the artifact cannot be certified is cheap at that point and expensive later:
 * an EAS build costs money and twenty minutes, and it ends in a signing key the
 * story is held to for its life.
 *
 * It runs **apksigner**, not the interpreter under it. Asking `java -version`
 * proves a Java exists and nothing about the jar beside it: a truncated
 * download, a build-tools release this JDK is too old for, or a jar with no
 * main class all answer that question happily and fail the one that matters.
 * The exit code is part of the answer too, and was not being read at all.
 */
export function apksignerReadiness(): { ready: true } | { ready: false; reason: string } {
  const tool = findApksigner();
  if (!tool) {
    return {
      ready: false,
      reason: 'apksigner was not found. It ships with the Android SDK build-tools; install those, '
        + 'set ANDROID_SDK_ROOT, or point APKSIGNER at the jar or executable. '
        + 'Without it a signature cannot be verified, and a build cannot be certified.',
    };
  }
  const probe = spawnSync(tool.command, [...tool.prefix, 'version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (probe.error) {
    return {
      ready: false,
      reason: `apksigner at ${tool.label} will not run: ${probe.error.message}`
        + (tool.prefix.length > 0 ? ' Install a JDK, or set JAVA_HOME.' : ''),
    };
  }
  if (probe.status !== 0) {
    const said = firstLine(`${probe.stdout ?? ''}${probe.stderr ?? ''}`);
    return {
      ready: false,
      reason: `apksigner at ${tool.label} exited ${probe.status}${said ? `: ${said}` : ''}. `
        + 'It is present but not usable, so no signature can be verified.',
    };
  }
  return { ready: true };
}

export function runApksigner(file: string, minSdkVersion?: number): ApksignerVerdict {
  const tool = findApksigner();
  if (!tool) {
    throw new ApksignerMissing(
      'apksigner was not found. It ships with the Android SDK build-tools; install those, '
      + 'or set ANDROID_SDK_ROOT, or point APKSIGNER at the jar or executable. '
      + 'A signature is not verified without it, and a build is not certified without that.',
    );
  }
  const arguments_ = [...tool.prefix, 'verify', '--print-certs', '-v'];
  if (minSdkVersion !== undefined) arguments_.push('--min-sdk-version', String(minSdkVersion));
  const result = spawnSync(tool.command, [...arguments_, file], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`Could not run ${tool.label}: ${result.error.message}`);
  }
  return parseApksignerOutput(
    tool.label,
    `${result.stdout ?? ''}${result.stderr ?? ''}`,
    result.status ?? 1,
  );
}
