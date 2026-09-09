/**
 * Build the installable studio: the editor as a desktop application.
 *
 *   pnpm build:web              # writes dist/ — the studio's web build
 *   pnpm build:studio-desktop   # wraps it in a Tauri window and an installer
 *
 * The sibling of `build-desktop.ts`, which packages one *published novel* for a
 * reader. This one packages the *engine* for an author, and the two differ in
 * the thing that matters most: a novel's identity is derived per release, and
 * the studio's is a constant it must never lose. See
 * `tools/studio-shell/README.md`.
 *
 * Two commands rather than one, for the reason `build-desktop.ts` gives: the
 * desktop channel consumes exactly what the web channel publishes, so there is
 * one answer to "what is in this build" and both channels read it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  STUDIO_IDENTIFIER,
  STUDIO_PRODUCT_NAME,
  assertStudioBundle,
  hasGeneratedIcons,
  stageStudioProject,
  verifyStagedStudioProject,
} from './lib/stage-studio';

import { beginOutPath } from '../tools/lib/out-path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'tools', 'studio-shell');
const ENGINE_ICON = path.join(REPO_ROOT, 'assets', 'images', 'icon.png');
const DEFAULT_BUNDLE = path.join(REPO_ROOT, 'dist');
const DEFAULT_OUT = path.join(REPO_ROOT, 'dist-studio-desktop');

const color = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

class CliFailure extends Error {}

function fail(message: string, details: string[] = []): never {
  console.error(color.red(`\n✖ ${message}`));
  for (const line of details) console.error(color.red(`    • ${line}`));
  console.error('');
  throw new CliFailure(message);
}

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
Build an installable desktop studio from the web build.

Usage:
  pnpm build:web
  pnpm build:studio-desktop [options]

Options:
  --bundle <dir>     The studio web build. Default: dist/
  --out <dir>        Where the staged Tauri project goes. Emptied first.
                     Default: dist-studio-desktop/
  --targets a,b      Bundle targets. Default: nsis on Windows, deb+appimage on
                     Linux, dmg on macOS.
  --icon <file.png>  Square PNG, at least 512px. Defaults to the engine icon.
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

/** See `build-desktop.ts`: asked of `where`/`which` so no shell mangles argv. */
function resolveExecutable(name: string): string | null {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [name], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function probe(command: string): string | null {
  const executable = resolveExecutable(command);
  if (!executable) return null;
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.trim().split('\n')[0];
}

interface TauriCli {
  argv: string[];
  description: string;
}

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

/**
 * The engine version, asked of the same source `build-web.mjs` asks.
 *
 * Not an option. The version is what an installer compares to decide whether it
 * is upgrading or reinstalling, so a build whose version came from the command
 * line is one an author can silently ship twice under the same number.
 */
function engineVersion(): string {
  const config = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'node_modules', 'expo', 'bin', 'cli'), 'config', '--type', 'public', '--json'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  if (config.status !== 0) {
    fail('Could not read the app config to find the engine version', [config.stderr?.trim() || '']);
  }
  // The CLI prints env notices before the JSON; take the object, not the noise.
  const start = config.stdout.indexOf('{');
  if (start < 0) fail('The app config printed no JSON.');
  const version = (JSON.parse(config.stdout.slice(start)) as { version?: unknown }).version;
  if (typeof version !== 'string' || !version) fail('The app config carries no version.');
  return version;
}

function defaultTargets(): string[] {
  if (process.platform === 'win32') return ['nsis'];
  if (process.platform === 'darwin') return ['dmg'];
  return ['deb', 'appimage'];
}

// ── Build ───────────────────────────────────────────────────────────────────

function run(argv: string[], cwd: string): number {
  const [command, ...rest] = argv;
  return spawnSync(command, rest, { cwd, stdio: 'inherit' }).status ?? 1;
}

function describeBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  console.log(color.green('▸ Building the desktop studio\n'));

  const readiness = checkToolchain();
  if (!args.stageOnly && !readiness.ready) {
    fail('This machine cannot build a desktop installer yet', [
      ...readiness.problems,
      'Or pass --stage-only to write the project without building it.',
    ]);
  }

  const bundleDir = args.bundle ? path.resolve(process.cwd(), args.bundle) : DEFAULT_BUNDLE;
  try {
    assertStudioBundle(bundleDir);
  } catch (error) {
    fail((error as Error).message);
  }

  const version = engineVersion();
  console.log(`  Application: ${color.green(STUDIO_PRODUCT_NAME)} ${color.dim(STUDIO_IDENTIFIER)}`);
  console.log(`  Version: ${color.green(`v${version}`)}`);

  const finalOutDir = args.out ? path.resolve(process.cwd(), args.out) : DEFAULT_OUT;
  const transaction = beginOutPath(finalOutDir, {
    repoRoot: REPO_ROOT,
    inputs: [bundleDir, TEMPLATE_DIR, ...(args.icon ? [path.resolve(args.icon)] : [])],
  });
  try {
    let staged;
    try {
      staged = stageStudioProject({
        bundleDir,
        outDir: transaction.workPath,
        templateDir: TEMPLATE_DIR,
        version,
        targets: args.targets.length > 0 ? args.targets : defaultTargets(),
        repoRoot: REPO_ROOT,
      });
    } catch (error) {
      fail((error as Error).message);
    }

    console.log(color.dim(
      `  Staged ${staged.frontendFileCount} bundle file(s), ${describeBytes(staged.frontendBytes)} → ${staged.outDir}`,
    ));

    if (readiness.cli) {
      const icon = args.icon ? path.resolve(args.icon) : ENGINE_ICON;
      if (!fs.existsSync(icon)) fail(`No icon at ${icon}`);
      const status = run(
        [...readiness.cli.argv, 'icon', icon, '-o', path.join(staged.srcTauriDir, 'icons')],
        staged.outDir,
      );
      if (status !== 0) fail('tauri icon failed');
      console.log(color.dim(`  Icons: ${path.relative(REPO_ROOT, icon)}`));
    } else {
      console.log(color.yellow('  ⚠ No Tauri CLI, so no icons were generated. The project will not build as staged.'));
    }

    const problems = verifyStagedStudioProject(staged.outDir);
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

    console.log(color.green('\n✔ Desktop studio build complete'));
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
