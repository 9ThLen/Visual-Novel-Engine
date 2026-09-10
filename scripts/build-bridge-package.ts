/**
 * Build the AI bridge as a folder a stranger can run on Windows.
 *
 *   pnpm ai-bridge:build          # writes tools/ai-bridge/dist
 *   pnpm build:bridge-package     # wraps it with a Node runtime and a launcher
 *
 * Two commands rather than one, for the reason the desktop channels give: the
 * package consumes exactly what the bundler emits, so there is one answer to
 * "what is in this package".
 *
 * The runtime is downloaded from nodejs.org and checked against the SHASUMS256
 * file published beside it. An unverified interpreter is not something to hand
 * an author and tell them to double-click.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BRIDGE_PACKAGE_NAME,
  checksumFor,
  stageBridgePackage,
  verifyStagedBridgePackage,
} from './lib/stage-bridge-package';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const BRIDGE_DIST = path.join(REPO_ROOT, 'tools', 'ai-bridge', 'dist');
const DEFAULT_OUT = path.join(REPO_ROOT, 'dist-bridge-package', BRIDGE_PACKAGE_NAME);

/**
 * The Node line the repository itself targets (`.nvmrc`, `engines`).
 *
 * Pinned rather than resolved to "latest": the runtime an author runs should be
 * one this repository's tests have run against, and a package rebuilt tomorrow
 * should contain the same interpreter as one built today unless someone decided
 * otherwise.
 */
const NODE_VERSION = 'v24.21.0';
const NODE_PLATFORM = 'win-x64';

const color = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

class CliFailure extends Error {}

function fail(message: string, details: string[] = []): never {
  console.error(color.red(`\n✖ ${message}`));
  for (const line of details) console.error(color.red(`    • ${line}`));
  console.error('');
  throw new CliFailure(message);
}

interface Args { out?: string; node?: string; nodeVersion: string; help: boolean }

function parseArgs(argv: string[]): Args {
  const args: Args = { nodeVersion: NODE_VERSION, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--out': args.out = argv[++i]; break;
      case '--node': args.node = argv[++i]; break;
      case '--node-version': args.nodeVersion = argv[++i]; break;
      case '--help': case '-h': args.help = true; break;
      default: if (arg.startsWith('--')) fail(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`
Package the AI bridge with the runtime it needs, for Windows.

Usage:
  pnpm ai-bridge:build
  pnpm build:bridge-package [options]

Options:
  --out <dir>            Where the package goes. Emptied first.
                         Default: dist-bridge-package/${BRIDGE_PACKAGE_NAME}
  --node <node.exe>      Use this runtime instead of downloading one. Its
                         checksum is not checked: you chose it.
  --node-version <vX.Y.Z>  Download this version instead of ${NODE_VERSION}.
  -h, --help             Show this help.

Needs an internet connection unless --node is given.
`);
}

/** The engine version, asked of the same source the other build scripts ask. */
function engineVersion(): string {
  const config = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'node_modules', 'expo', 'bin', 'cli'), 'config', '--type', 'public', '--json'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  if (config.status !== 0) fail('Could not read the app config to find the engine version');
  const start = config.stdout.indexOf('{');
  if (start < 0) fail('The app config printed no JSON.');
  const version = (JSON.parse(config.stdout.slice(start)) as { version?: unknown }).version;
  if (typeof version !== 'string' || !version) fail('The app config carries no version.');
  return version;
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) fail(`Could not download ${url}`, [`The server answered ${response.status}.`]);
  return new Uint8Array(await response.arrayBuffer());
}

/** Downloads a Node runtime, verifies it, and returns the path to `node.exe`. */
async function fetchNodeExecutable(version: string, workDir: string): Promise<string> {
  const archive = `node-${version}-${NODE_PLATFORM}.zip`;
  const base = `https://nodejs.org/dist/${version}`;
  console.log(color.dim(`  downloading ${archive}`));

  const [zip, shasums] = await Promise.all([
    download(`${base}/${archive}`),
    download(`${base}/SHASUMS256.txt`).then(bytes => new TextDecoder().decode(bytes)),
  ]);

  const expected = checksumFor(shasums, archive);
  const actual = createHash('sha256').update(zip).digest('hex');
  if (actual !== expected) {
    fail('The downloaded Node runtime does not match its published checksum', [
      `expected ${expected}`,
      `actual   ${actual}`,
      'Nothing was written. Do not ship this.',
    ]);
  }
  console.log(color.dim(`  checksum ok: ${actual.slice(0, 16)}…`));

  const zipPath = path.join(workDir, archive);
  fs.writeFileSync(zipPath, zip);
  const unzip = spawnSync('unzip', ['-q', '-o', zipPath, '-d', workDir], { encoding: 'utf8' });
  if (unzip.status !== 0) {
    fail('Could not unpack the Node archive', [unzip.stderr?.trim() || 'unzip is not available on PATH.']);
  }

  const executable = path.join(workDir, `node-${version}-${NODE_PLATFORM}`, 'node.exe');
  if (!fs.existsSync(executable)) fail(`The archive did not contain node.exe at ${executable}`);
  return executable;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const outDir = path.resolve(args.out ?? DEFAULT_OUT);
  const version = engineVersion();
  console.log(`\nPackaging the AI bridge ${color.dim(`(engine ${version})`)}`);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vne-bridge-node-'));
  try {
    const nodeExecutable = args.node
      ? path.resolve(args.node)
      : await fetchNodeExecutable(args.nodeVersion, workDir);

    const staged = stageBridgePackage({
      bridgeDistDir: BRIDGE_DIST,
      nodeExecutable,
      outDir,
      version,
      nodeVersion: args.node ? 'supplied by --node' : args.nodeVersion,
      repoRoot: REPO_ROOT,
    });

    const problems = verifyStagedBridgePackage(staged.outDir);
    if (problems.length) fail('The staged package did not verify', problems);

    console.log(color.green('\n✔ Package written'));
    console.log(`  ${staged.outDir}`);
    console.log(color.dim('\n  Zip this folder and hand it to an author. Nothing else is needed on'));
    console.log(color.dim('  their machine — the runtime is inside.\n'));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  if (!(error instanceof CliFailure)) console.error(color.red(String(error?.stack ?? error)));
  process.exitCode = 1;
});
