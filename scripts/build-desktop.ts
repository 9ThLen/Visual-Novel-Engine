/**
 * Build a desktop installer from a published web bundle.
 *
 *   pnpm export:story --release novel.vnerelease --out ./novel-web
 *   pnpm build:desktop --bundle ./novel-web --out ./novel-desktop
 *
 * Two commands rather than one on purpose: the desktop channel consumes exactly
 * what the web channel publishes, so there is one answer to "what is in this
 * release" and both channels read it. A `--release` shortcut here would be a
 * second reader of the container, and second readers drift.
 *
 * What the script itself does is small — stage, generate icons, verify, then
 * hand off to `tauri build`. The staging rules live in `lib/stage-desktop.ts`
 * because they can be tested on a machine with no Rust; everything below the
 * `tauri build` line cannot be tested anywhere without a toolchain, so there is
 * as little of it as possible.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  pickIconSource,
  stageDesktopProject,
  verifyStagedProject,
  hasGeneratedIcons,
  readBundleRelease,
} from './lib/stage-desktop';

import { readInlinedPlayerConfig } from '@/lib/release/player-bundle';
import { beginOutPath } from '../tools/lib/out-path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'tools', 'desktop-shell');
const ENGINE_ICON = path.join(REPO_ROOT, 'assets', 'images', 'icon.png');

const color = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function fail(message: string, details: string[] = []): never {
  console.error(color.red(`\n✖ ${message}`));
  for (const line of details) console.error(color.red(`    • ${line}`));
  console.error('');
  throw new CliFailure(message);
}

class CliFailure extends Error {}

interface Args {
  bundle?: string;
  out?: string;
  targets: string[];
  icon?: string;
  stageOnly: boolean;
  debug: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { targets: [], stageOnly: false, debug: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--bundle': args.bundle = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--targets': args.targets = (argv[++i] ?? '').split(',').map((t) => t.trim()).filter(Boolean); break;
      case '--icon': args.icon = argv[++i]; break;
      case '--stage-only': args.stageOnly = true; break;
      case '--debug': args.debug = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        if (arg.startsWith('--')) fail(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Build a desktop installer from an exported player bundle.

Usage:
  pnpm build:desktop --bundle <dir> --out <dir> [options]

Options:
  --bundle <dir>     A bundle from 'pnpm export:story --release …' (required).
  --out <dir>        Where the staged Tauri project goes. Emptied first.
  --targets a,b      Bundle targets. Default: nsis on Windows, deb+appimage on
                     Linux, dmg on macOS.
  --icon <file.png>  Square PNG, at least 512px, for the application icon.
                     Defaults to the story cover when it is square, and to the
                     engine icon otherwise.
  --stage-only       Write the project and stop. Needs no Rust toolchain.
  --debug            Build the debug profile: much faster, much larger.
  -h, --help         Show this help.

Needs, unless --stage-only:
  Rust        https://rustup.rs
  Tauri CLI   pnpm add -D @tauri-apps/cli@^2
  Windows     WebView2 (present on Windows 10/11) and the MSVC build tools
  Linux       libwebkit2gtk-4.1-dev, build-essential, libssl-dev, libayatana-appindicator3-dev, librsvg2-dev
`);
}

// ── Toolchain ───────────────────────────────────────────────────────────────

/**
 * Find a command on PATH and return its full path.
 *
 * Asked of `where`/`which` rather than handled with `shell: true`, which is the
 * obvious way to make Windows apply PATHEXT and also the way arguments stop
 * being arguments: a spawn through a shell concatenates them, so the first
 * author whose home directory has a space in it gets an unexplainable failure.
 */
function resolveExecutable(name: string): string | null {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [name], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

/** The version line a tool prints, or nothing when it is not installed. */
function probe(command: string): string | null {
  const executable = resolveExecutable(command);
  if (!executable) return null;
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.trim().split('\n')[0];
}

interface TauriCli {
  /** Argv to invoke it: either node + the package's entry, or a bare command. */
  argv: string[];
  description: string;
}

/**
 * The Tauri CLI, or nothing.
 *
 * Not a dependency of this repository. It carries a prebuilt binary per
 * platform, and it is useless without a Rust toolchain that cannot be installed
 * from a lockfile anyway — so an author who wants a desktop build installs both,
 * and everyone else does not carry either.
 */
function findTauriCli(): TauriCli | null {
  const local = path.join(REPO_ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  if (fs.existsSync(local)) {
    return { argv: [process.execPath, local], description: '@tauri-apps/cli' };
  }
  for (const name of ['tauri', 'cargo-tauri']) {
    const executable = resolveExecutable(name);
    if (executable) return { argv: [executable], description: `${name} (on PATH)` };
  }
  return null;
}

interface Readiness {
  ready: boolean;
  problems: string[];
  cli: TauriCli | null;
}

/**
 * Checked before anything is staged, and reported as a list rather than as the
 * first failure: an author on a fresh machine is missing all of it, and finding
 * that out one `--version` at a time is three round trips through a build.
 */
function checkToolchain(): Readiness {
  const problems: string[] = [];
  if (!probe('cargo')) {
    problems.push('cargo is not on PATH. Install Rust from https://rustup.rs and reopen the terminal.');
  }
  const cli = findTauriCli();
  if (!cli) {
    problems.push('The Tauri CLI is not available. Run: pnpm add -D @tauri-apps/cli@^2');
  }
  return { ready: problems.length === 0, problems, cli };
}

function defaultTargets(): string[] {
  if (process.platform === 'win32') return ['nsis'];
  if (process.platform === 'darwin') return ['dmg'];
  return ['deb', 'appimage'];
}

// ── Build ───────────────────────────────────────────────────────────────────

/** Every argv here starts with a resolved absolute path, so no shell is needed. */
function run(argv: string[], cwd: string): number {
  const [command, ...rest] = argv;
  return spawnSync(command, rest, { cwd, stdio: 'inherit' }).status ?? 1;
}

function describeBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Everything the bundler wrote, so the author is told where the installer is. */
function findArtifacts(srcTauriDir: string, debug: boolean): string[] {
  const bundleDir = path.join(srcTauriDir, 'target', debug ? 'debug' : 'release', 'bundle');
  if (!fs.existsSync(bundleDir)) return [];
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(exe|msi|deb|rpm|dmg|AppImage)$/i.test(entry.name)) found.push(full);
    }
  };
  walk(bundleDir);
  return found;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (!args.bundle) fail('--bundle is required (a directory from "pnpm export:story")');
  if (!args.out) fail('--out is required (where the staged Tauri project goes)');

  console.log(color.green('▸ Building a desktop application\n'));

  const readiness = checkToolchain();
  if (!args.stageOnly && !readiness.ready) {
    // Refused before staging rather than after: writing a project the machine
    // cannot build, and only saying so at the end, wastes the author's time and
    // leaves a directory that looks like a result.
    fail('This machine cannot build a desktop installer yet', [
      ...readiness.problems,
      'Or pass --stage-only to write the project without building it.',
    ]);
  }

  const bundleDir = path.resolve(process.cwd(), args.bundle);
  let release;
  try {
    release = readBundleRelease(bundleDir);
  } catch (error) {
    fail((error as Error).message);
  }
  console.log(`  Story: ${color.green(release.title || release.storyId)} (${release.storyId})`);
  console.log(`  Release: ${color.green(`v${release.version}`)} ${color.dim(release.releaseId)}`);

  const finalOutDir = path.resolve(process.cwd(), args.out);
  const transaction = beginOutPath(finalOutDir, {
    repoRoot: REPO_ROOT,
    inputs: [bundleDir, TEMPLATE_DIR, ...(args.icon ? [path.resolve(args.icon)] : [])],
  });
  try {
  let staged;
  try {
    staged = stageDesktopProject({
      bundleDir,
      outDir: transaction.workPath,
      templateDir: TEMPLATE_DIR,
      targets: args.targets.length > 0 ? args.targets : defaultTargets(),
      repoRoot: REPO_ROOT,
    });
  } catch (error) {
    fail((error as Error).message);
  }

  console.log(`  Application: ${color.green(staged.identity.productName)} ${color.dim(staged.identity.applicationId)}`);
  console.log(color.dim(
    `  Staged ${staged.frontendFileCount} bundle file(s), ${describeBytes(staged.frontendBytes)} → ${staged.outDir}`,
  ));

  // Icons. `tauri icon` ships with the same CLI as `tauri build`, so an author
  // who can build can always generate them.
  if (readiness.cli) {
    const config = readInlinedPlayerConfig(fs.readFileSync(path.join(bundleDir, 'index.html'), 'utf8'));
    const choice = pickIconSource({
      bundleDir,
      fallbackIcon: ENGINE_ICON,
      override: args.icon,
      story: config?.story as { thumbnailUri?: unknown } | null,
      assets: config?.assets,
    });
    const status = run(
      [...readiness.cli.argv, 'icon', choice.file, '-o', path.join(staged.srcTauriDir, 'icons')],
      staged.outDir,
    );
    if (status !== 0) fail('tauri icon failed');
    console.log(color.dim(`  Icons: ${choice.reason}`));
  } else {
    console.log(color.yellow('  ⚠ No Tauri CLI, so no icons were generated. The project will not build as staged.'));
  }

  const problems = verifyStagedProject(staged.outDir);
  if (problems.length > 0) fail('The staged project is not usable', problems);
  console.log(color.dim('  Verified the staged project'));

  if (args.stageOnly) {
    transaction.commit();
    console.log(color.green(`\n✔ Staged: ${finalOutDir}`));
    console.log(color.dim(`  Build it with:  cd ${path.relative(process.cwd(), finalOutDir)} && tauri build\n`));
    return;
  }

  if (!hasGeneratedIcons(staged.srcTauriDir)) {
    fail('The staged project has no icons, and the Windows bundler needs an .ico');
  }

  console.log(`\n  Running: tauri build ${color.dim(`(${readiness.cli?.description}, targets: ${staged.targets.join(', ')})`)}\n`);
  const buildArgv = [...(readiness.cli as TauriCli).argv, 'build'];
  if (args.debug) buildArgv.push('--debug');
  const status = run(buildArgv, staged.outDir);
  if (status !== 0) fail('tauri build failed');

  const artifacts = findArtifacts(staged.srcTauriDir, args.debug);
  if (artifacts.length === 0) {
    fail('tauri build reported success but produced no installer', [
      `Nothing matched in ${path.join(staged.srcTauriDir, 'target')}`,
    ]);
  }

  const artifactSummaries = artifacts.map((artifact) => ({
    relative: path.relative(staged.outDir, artifact),
    bytes: fs.statSync(artifact).size,
  }));
  transaction.commit();

  console.log(color.green('\n✔ Desktop build complete'));
  for (const artifact of artifactSummaries) {
    console.log(`    ${path.join(finalOutDir, artifact.relative)} ${color.dim(describeBytes(artifact.bytes))}`);
  }
  console.log('');
  } catch (error) {
    transaction.abort();
    throw error;
  }
}

void main().catch((error) => {
  if (!(error instanceof CliFailure)) console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
