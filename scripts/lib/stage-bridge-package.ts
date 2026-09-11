/**
 * Stage the AI bridge as a folder a stranger can run on Windows.
 *
 * The studio installs from one `.exe`, but the bridge it talks to is a Node
 * process, and the machine it lands on has no Node, no checkout, no pnpm and no
 * reason to have any of them. So the runtime travels with the bridge: an
 * official `node.exe`, the bundle `pnpm ai-bridge:build` emits, and one script
 * to double-click.
 *
 * The sibling of `stage-studio.ts`, and split from its CLI for the same reason:
 * everything here runs on a machine with no Windows, so what the package *is*
 * has tests, and the part that downloads a runtime gets as little code as
 * possible above it.
 *
 * This is not the sidecar. Nothing in the studio launches this; the author
 * starts it, reads the token it prints, and pairs the editor once. Making the
 * studio spawn it needs `tauri-plugin-shell` and a widened capability file —
 * see `tools/studio-shell/README.md`.
 */
import fs from 'node:fs';
import path from 'node:path';

import { beginOutPath } from '../../tools/lib/out-path';

/** The folder the author ends up with. */
export const BRIDGE_PACKAGE_NAME = 'VNE-AI-Bridge';

/** What they double-click. `.cmd`, not `.bat`: it is what Windows documents. */
export const LAUNCHER_NAME = 'Start AI Bridge.cmd';

/** Where the bundle sits, so the folder root holds only what a person touches. */
export const BRIDGE_SUBDIR = 'bridge';

export const NODE_EXECUTABLE_NAME = 'node.exe';

/** Everything `tools/ai-bridge/build.mjs` emits. All of it is required. */
export const REQUIRED_BRIDGE_FILES = [
  'cli.mjs',
  'system-prompt.md',
  'codex-response-schema.json',
] as const;

/**
 * Proof that `cli.mjs` is the bridge rather than a failed or truncated build.
 *
 * A zero-byte or half-written bundle is still a file, still copies, still
 * packages, and fails on the author's machine instead of on ours. This string is
 * printed by `startup-summary.ts` and so cannot survive a build that produced
 * nothing.
 */
const BUNDLE_MARKER = 'AI BRIDGE PAIRING';

export interface StageBridgePackageInput {
  /** `tools/ai-bridge/dist` — what `pnpm ai-bridge:build` wrote. */
  bridgeDistDir: string;
  /** An official `node.exe` for Windows. */
  nodeExecutable: string;
  /** Where the package goes. Emptied first. */
  outDir: string;
  /** The engine version, for the README. */
  version: string;
  /** The Node version shipped, for the README. */
  nodeVersion: string;
  repoRoot: string;
  cwd?: string;
}

export interface StagedBridgePackage {
  outDir: string;
  launcher: string;
  files: string[];
}

/** Refuses a bundle that would fail on the author's machine rather than ours. */
export function assertBridgeDist(bridgeDistDir: string): void {
  if (!fs.existsSync(bridgeDistDir)) {
    throw new Error(`The bridge bundle is missing: ${bridgeDistDir}\nRun: pnpm ai-bridge:build`);
  }
  for (const name of REQUIRED_BRIDGE_FILES) {
    const file = path.join(bridgeDistDir, name);
    if (!fs.existsSync(file)) {
      throw new Error(`The bridge bundle is incomplete — ${name} is missing.\nRun: pnpm ai-bridge:build`);
    }
    if (fs.statSync(file).size === 0) {
      throw new Error(`The bridge bundle is truncated — ${name} is empty.\nRun: pnpm ai-bridge:build`);
    }
  }
  const bundle = fs.readFileSync(path.join(bridgeDistDir, 'cli.mjs'), 'utf8');
  if (!bundle.includes(BUNDLE_MARKER)) {
    throw new Error(
      'cli.mjs does not look like the bridge — it is missing the pairing block.\n'
      + 'Run: pnpm ai-bridge:build',
    );
  }
}

/**
 * The launcher.
 *
 * Every path is absolute via `%~dp0`, so the folder works from the Desktop, from
 * a USB stick, or from wherever a browser put it. The working directory is left
 * alone on purpose: the bridge reads its settings from a per-user directory
 * precisely so that where it was started from cannot change what it finds.
 *
 * It pauses only when the bridge fails. A double-clicked window that closes
 * instantly is a bridge that reported an error to nobody.
 */
export function launcherScript(): string {
  return [
    '@echo off',
    'setlocal',
    'rem Starts the Visual Novel Engine AI bridge. Close this window to stop it.',
    `"%~dp0${NODE_EXECUTABLE_NAME}" "%~dp0${BRIDGE_SUBDIR}\\cli.mjs" %*`,
    'if errorlevel 1 (',
    '  echo.',
    '  echo The bridge stopped with an error. The message above says why.',
    '  pause',
    ')',
    '',
  ].join('\r\n');
}

/** What the author reads if they open the folder before running anything. */
export function readmeText(version: string, nodeVersion: string): string {
  return [
    'Visual Novel Engine — AI bridge',
    `Engine ${version}. Bundled Node ${nodeVersion}.`,
    '',
    'This folder is self-contained. Nothing needs to be installed: the Node',
    'runtime the bridge needs is the node.exe sitting next to this file.',
    '',
    'TO USE IT',
    '',
    `  1. Double-click "${LAUNCHER_NAME}".`,
    '  2. On the first run it writes a settings file and tells you where.',
    '     Open that file, put your API key in it, and save.',
    `  3. Double-click "${LAUNCHER_NAME}" again.`,
    '  4. It prints a block with a URL and a token. Leave this window open.',
    '  5. In the studio, open the AI panel and paste the URL and the token.',
    '',
    'The token stays the same next time, so step 5 is done once.',
    '',
    'WHERE YOUR SETTINGS LIVE',
    '',
    '  %LOCALAPPDATA%\\VisualNovelEngine\\Bridge',
    '',
    'Paste that into the Explorer address bar to open it. Settings are in',
    'bridge.env; the pairing token is in token. Set VNE_BRIDGE_HOME to an',
    'absolute path to keep them somewhere else.',
    '',
    'IF YOU NEED A NEW TOKEN',
    '',
    `  Run "${LAUNCHER_NAME}" --reset-token`,
    '',
    '  This issues a new one and exits. A bridge that is already running keeps',
    '  the old token until you close and reopen it.',
    '',
    'YOUR API KEY',
    '',
    '  It is read by this bridge and nothing else. It is not sent to the studio,',
    '  and the studio never stores it — the studio only ever holds the token',
    '  above, which is useful to nothing except this bridge on this machine.',
    '',
  ].join('\r\n');
}

/** Writes the package. Everything it needs is checked before anything is moved. */
export function stageBridgePackage(input: StageBridgePackageInput): StagedBridgePackage {
  assertBridgeDist(input.bridgeDistDir);
  if (!fs.existsSync(input.nodeExecutable)) {
    throw new Error(`The Node runtime to ship is missing: ${input.nodeExecutable}`);
  }
  if (fs.statSync(input.nodeExecutable).size === 0) {
    throw new Error(`The Node runtime to ship is empty: ${input.nodeExecutable}`);
  }

  const transaction = beginOutPath(input.outDir, {
    repoRoot: input.repoRoot,
    cwd: input.cwd,
    inputs: [input.bridgeDistDir, input.nodeExecutable],
  });
  try {
    const workDir = transaction.workPath;
    const workBridgeDir = path.join(workDir, BRIDGE_SUBDIR);
    fs.mkdirSync(workBridgeDir, { recursive: true });
    for (const name of REQUIRED_BRIDGE_FILES) {
      fs.copyFileSync(path.join(input.bridgeDistDir, name), path.join(workBridgeDir, name));
    }
    fs.copyFileSync(input.nodeExecutable, path.join(workDir, NODE_EXECUTABLE_NAME));
    fs.writeFileSync(path.join(workDir, LAUNCHER_NAME), launcherScript(), 'utf8');
    fs.writeFileSync(path.join(workDir, 'README.txt'), readmeText(input.version, input.nodeVersion), 'utf8');

    transaction.commit();
    return {
      outDir: path.resolve(input.outDir),
      launcher: path.join(path.resolve(input.outDir), LAUNCHER_NAME),
      files: [
        LAUNCHER_NAME,
        NODE_EXECUTABLE_NAME,
        'README.txt',
        ...REQUIRED_BRIDGE_FILES.map(name => `${BRIDGE_SUBDIR}/${name}`),
      ],
    };
  } catch (error) {
    transaction.abort();
    throw error;
  }
}

/** Reads the result back, because staging having run is not the same as it working. */
export function verifyStagedBridgePackage(outDir: string): string[] {
  const problems: string[] = [];
  const expect = (relative: string) => {
    const file = path.join(outDir, relative);
    if (!fs.existsSync(file)) problems.push(`${relative} is missing`);
    else if (fs.statSync(file).size === 0) problems.push(`${relative} is empty`);
  };

  expect(LAUNCHER_NAME);
  expect(NODE_EXECUTABLE_NAME);
  expect('README.txt');
  for (const name of REQUIRED_BRIDGE_FILES) expect(path.join(BRIDGE_SUBDIR, name));

  if (fs.existsSync(path.join(outDir, LAUNCHER_NAME))) {
    const launcher = fs.readFileSync(path.join(outDir, LAUNCHER_NAME), 'utf8');
    // Windows runs a .cmd line by line; a stray LF splits a quoted path.
    if (/[^\r]\n/.test(launcher)) problems.push(`${LAUNCHER_NAME} does not use CRLF line endings`);
    if (!launcher.includes('%~dp0')) {
      problems.push(`${LAUNCHER_NAME} uses a relative path and will fail unless run from its own folder`);
    }
  }
  return problems;
}

/**
 * The published checksum for one file in a Node release.
 *
 * `SHASUMS256.txt` is a flat `<sha256>  <filename>` list covering every artifact
 * of a release, several of which share a prefix — `…win-x64.zip` and
 * `…win-x64.7z` differ by three characters. The name is matched exactly, and a
 * release that renames or drops our archive fails here rather than handing an
 * author an interpreter nobody checked.
 */
export function checksumFor(shasums: string, fileName: string): string {
  for (const line of shasums.split('\n')) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === fileName) return hash;
  }
  throw new Error(`${fileName} is not listed in SHASUMS256.txt for this release.`);
}

/**
 * Unpacks a zip using whatever the build machine already has.
 *
 * Node has no zip reader, and this ran `unzip` unconditionally — which is not on
 * a Windows PATH, so building the Windows package on Windows failed. Each
 * platform's own tool is tried in turn and every failure is reported together,
 * because "unzip is not available" is unhelpful on a machine that was never
 * going to have it.
 *
 * This is a build-machine dependency only. The author who runs the package needs
 * none of it.
 */
export function zipExtractors(platform: NodeJS.Platform = process.platform): { command: string; args(zip: string, into: string): string[] }[] {
  const bsdtar = { command: 'tar', args: (zip: string, into: string) => ['-xf', zip, '-C', into] };
  const unzip = { command: 'unzip', args: (zip: string, into: string) => ['-q', '-o', zip, '-d', into] };
  const expandArchive = {
    command: 'powershell',
    args: (zip: string, into: string) => [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${into}' -Force`,
    ],
  };
  // Windows 10 ships bsdtar, which reads zip; PowerShell is the fallback there.
  // Elsewhere `unzip` is the usual one and GNU tar cannot read a zip at all.
  return platform === 'win32' ? [bsdtar, expandArchive] : [unzip, bsdtar];
}


/**
 * Whether this studio build ships the bridge, and why not when it does not.
 *
 * Two ways to arrive without one, and they deserve different volumes. Passing
 * `--no-bridge` is a decision; finding nothing at the default path is usually a
 * missed step, because the documented recipe runs four commands and the two that
 * build the package are the easy ones to skip. A build that omits the bridge
 * still works — its AI panel can only pair with a bridge the author starts — so
 * this reports rather than refuses.
 */
export type BridgePackageChoice =
  | { ship: true; dir: string }
  | { ship: false; because: 'asked' }
  | { ship: false; because: 'missing'; looked: string };

export function resolveBridgePackage(input: {
  noBridge: boolean;
  explicit?: string;
  defaultDir: string;
  exists: (path: string) => boolean;
  resolve: (path: string) => string;
}): BridgePackageChoice {
  if (input.noBridge) return { ship: false, because: 'asked' };
  // An explicit path is a decision too: a missing one is an error the caller
  // should see, not a silent fallback to shipping nothing.
  if (input.explicit) return { ship: true, dir: input.resolve(input.explicit) };
  return input.exists(input.defaultDir)
    ? { ship: true, dir: input.defaultDir }
    : { ship: false, because: 'missing', looked: input.defaultDir };
}
