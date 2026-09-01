/**
 * Stage a `.vnerelease` into an Expo project EAS can build.
 *
 *   pnpm stage:android --release novel.vnerelease --out ./novel-android
 *
 * Then, on a machine with an Expo account:
 *
 *   cd ./novel-android && eas build --platform android --profile player-apk
 *
 * The staging is the part that can be checked without a cloud account, and this
 * command checks it: the structural pass, the player's whole module graph
 * resolved inside the staged copy, the resolved Expo config, and — the one R4
 * specified and had nowhere to apply — `expo-modules-autolinking` reporting the
 * reduced native set for this project rather than the engine's.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  parseAutolinkedModulesOutput,
  stageAndroidProject,
  verifyStagedAndroidProject,
} from './stage-android';

import playerProfile from '../../player-profile.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

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
  process.exit(1);
}

interface Args {
  release?: string;
  out?: string;
  easProjectId?: string;
  icon?: string;
  skipChecks: boolean;
  allowEngineProject: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { skipChecks: false, allowEngineProject: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--release': args.release = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--eas-project-id': args.easProjectId = argv[++i]; break;
      case '--icon': args.icon = argv[++i]; break;
      case '--skip-checks': args.skipChecks = true; break;
      case '--allow-engine-project': args.allowEngineProject = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        if (argv[i].startsWith('--')) fail(`Unknown option: ${argv[i]}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Stage a release as an Android player project.

Usage:
  pnpm stage:android --release <file.vnerelease> --out <dir> [options]

Options:
  --release <file>        The release to build (required).
  --out <dir>             Where the staged project goes. Emptied first.
  --eas-project-id <id>   The author's own EAS project. Theirs, not the engine's.
  --icon <file.png>       Square PNG, at least 512px. Defaults to the story
                          cover when it is square, and to the engine icon
                          otherwise.
  --skip-checks           Stage only. The checks need this repo's node_modules.
  --allow-engine-project  Build against the engine's own EAS project. Only for
                          trying the pipeline out: the credentials Android holds
                          a story to for its whole life would not be yours.
  -h, --help              Show this help.
`);
}

function describeBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Point the staged project at this repository's installed packages.
 *
 * A junction rather than a copy — `node_modules` here is gigabytes — and a
 * junction rather than a symlink because Windows allows a non-administrator to
 * create the first and not the second. `.easignore` keeps it out of the upload;
 * EAS installs from the lockfile, in the cloud, which is the only install that
 * matters for the artifact. This exists so the checks below can run at all.
 */
function linkNodeModules(outDir: string): boolean {
  const target = path.join(outDir, 'node_modules');
  if (fs.existsSync(target)) return true;
  try {
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), target, 'junction');
    return true;
  } catch {
    return false;
  }
}

interface CheckResult { ok: boolean; detail: string[] }

/** Resolve the staged Expo config and confirm it describes the right app. */
function checkExpoConfig(outDir: string, env: Record<string, string>): CheckResult {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'node_modules', 'expo', 'bin', 'cli'), 'config', '--type', 'public', '--json'],
    { cwd: outDir, encoding: 'utf8', env: { ...process.env, ...env } },
  );
  if (result.status !== 0) {
    return { ok: false, detail: ['expo config failed', ...(result.stderr ?? '').trim().split('\n').slice(-6)] };
  }

  let config: {
    name?: string; version?: string; slug?: string; scheme?: string; icon?: string;
    android?: { package?: string; versionCode?: number; blockedPermissions?: string[] };
    extra?: { router?: { root?: string }; eas?: { projectId?: string } };
    plugins?: (string | [string, Record<string, unknown>])[];
  };
  try {
    config = JSON.parse(result.stdout);
  } catch {
    return { ok: false, detail: ['expo config did not print JSON'] };
  }

  const problems: string[] = [];
  const expect = (actual: unknown, wanted: unknown, what: string) => {
    if (String(actual) !== String(wanted)) problems.push(`${what}: expected ${wanted}, got ${actual}`);
  };
  expect(config.name, env.VNE_PLAYER_APP_NAME, 'name');
  expect(config.version, env.VNE_PLAYER_VERSION, 'version');
  expect(config.slug, env.VNE_PLAYER_SLUG, 'slug');
  expect(config.icon, env.VNE_PLAYER_ICON, 'icon');
  // Its own, not the engine's: duplicate scheme registrations are resolved
  // arbitrarily, so two installed novels would fight over the same links.
  expect(config.scheme, env.VNE_PLAYER_SCHEME, 'scheme');
  expect(config.android?.package, env.VNE_PLAYER_APP_ID, 'android.package');
  expect(config.android?.versionCode, env.VNE_PLAYER_VERSION_CODE, 'android.versionCode');
  expect(config.extra?.eas?.projectId, env.VNE_EAS_PROJECT_ID, 'extra.eas.projectId');
  // The router root is the whole reason the editor is not in this build.
  expect(config.extra?.router?.root, './app-player', 'router root');
  for (const permission of playerProfile.PLAYER_BLOCKED_PERMISSIONS) {
    if (!config.android?.blockedPermissions?.includes(permission)) {
      problems.push(`android.blockedPermissions is missing ${permission}`);
    }
  }
  const splash = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  );
  expect(Array.isArray(splash) ? splash[1]?.image : undefined, env.VNE_PLAYER_SPLASH, 'splash image');
  return {
    ok: problems.length === 0,
    detail: problems.length > 0 ? problems : [
      `${config.name} ${config.version} (${config.android?.package}, code ${config.android?.versionCode})`,
    ],
  };
}

/**
 * The check R4 wrote and could not run.
 *
 * `expo-modules-autolinking` reads its exclusions from `package.json` — never
 * from the Expo app config — and this repository's own `package.json` is shared
 * with the studio, which needs the pickers. The staged project has one of its
 * own, so here the exclusions finally mean something, and here is where that
 * stops being a claim.
 */
function resolveAutolinkedModules(projectDir: string): CheckResult & { modules?: string[] } {
  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules', 'expo-modules-autolinking', 'bin', 'expo-modules-autolinking.js'),
      'resolve', '-p', 'android', '--json',
    ],
    { cwd: projectDir, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    return { ok: false, detail: ['autolinking resolve failed', ...(result.stderr ?? '').trim().split('\n').slice(-4)] };
  }

  let linked: string[];
  try {
    linked = parseAutolinkedModulesOutput(result.stdout);
  } catch {
    return { ok: false, detail: ['autolinking resolve did not print the expected JSON schema'] };
  }
  return { ok: true, detail: [], modules: linked };
}

function checkAutolinking(outDir: string): CheckResult {
  const engine = resolveAutolinkedModules(REPO_ROOT);
  if (!engine.ok || !engine.modules) return engine;
  const staged = resolveAutolinkedModules(outDir);
  if (!staged.ok || !staged.modules) return staged;

  const linked = staged.modules;
  const expected = engine.modules.filter(
    (name) => !playerProfile.PLAYER_AUTOLINKING_EXCLUDE.includes(name),
  );

  const leaked = playerProfile.PLAYER_AUTOLINKING_EXCLUDE.filter((name) => linked.includes(name));
  const missing = expected.filter((name) => !linked.includes(name));
  const unexpected = linked.filter((name) => !expected.includes(name));
  const problems = [
    ...leaked.map((name) => `${name} is still linked into the APK`),
    ...missing.map((name) => `${name} disappeared from the staged native graph`),
    ...unexpected.map((name) => `${name} appears only in the staged native graph`),
  ];
  return {
    ok: problems.length === 0,
    detail: problems.length > 0
      ? problems
      : [`${linked.length} native module(s) linked; ${playerProfile.PLAYER_AUTOLINKING_EXCLUDE.length} excluded`],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (!args.release) fail('--release is required (a .vnerelease file)');
  if (!args.out) fail('--out is required (where the staged project goes)');
  if (!args.easProjectId && !args.allowEngineProject) {
    // Refused rather than warned. Android holds an app to the key that signed
    // it for the life of the story, and the account that owns that key should be
    // the author's — a warning on a command that then prints `eas build` and
    // exits 0 is an invitation to publish from someone else's account.
    fail('--eas-project-id is required', [
      "A build belongs to the author's own EAS project, because the signing",
      'credentials it creates are what every future update has to match.',
      'Run `eas init` in the staged project to make one, or pass',
      "--allow-engine-project to try the pipeline against the engine's.",
    ]);
  }

  console.log(color.green('▸ Staging an Android player project\n'));

  let staged;
  try {
    staged = await stageAndroidProject({
      releaseFile: path.resolve(process.cwd(), args.release),
      outDir: path.resolve(process.cwd(), args.out),
      repoRoot: REPO_ROOT,
      easProjectId: args.easProjectId,
      allowEngineProject: args.allowEngineProject,
      iconOverride: args.icon,
    });
  } catch (error) {
    fail((error as Error).message);
  }

  const { story, release } = staged.manifest;
  console.log(`  Story: ${color.green(story.title)} (${story.id})`);
  console.log(`  Release: ${color.green(`v${release.version}`)} ${color.dim(release.releaseId)}`);
  console.log(`  Application: ${color.green(staged.identity.productName)} `
    + color.dim(`${staged.identity.applicationId}, version code ${staged.identity.androidVersionCode}`));
  console.log(color.dim(`  Media: ${staged.mediaFiles.length} file(s), ${describeBytes(staged.mediaBytes)}`));
  console.log(color.dim(`  Icons: ${staged.icon.reason}`));
  console.log(color.dim(
    `  Dropped ${staged.prunedAssets} bundled asset(s) the player never shows, `
    + `${describeBytes(staged.prunedBytes)}`,
  ));
  if (!args.easProjectId) {
    console.log(color.yellow('  ⚠ --allow-engine-project: this build would go to the engine\'s EAS project,'));
    console.log(color.yellow('    and be signed with credentials that are not the author\'s.'));
  }

  const problems = verifyStagedAndroidProject(staged.outDir);
  if (problems.length > 0) fail('The staged project is not usable', problems);
  console.log(color.dim('  Verified the staged project'));

  const missing = staged.unresolvedModules;
  if (missing.length > 0) {
    fail('The staged project is missing modules the player imports', [
      ...missing.slice(0, 10).map((entry) => `${entry.from} → ${entry.specifier}`),
      ...(missing.length > 10 ? [`…and ${missing.length - 10} more`] : []),
      'Add whatever holds them to STAGED_ROOT_DIRS in tools/vne-build/stage-android.ts.',
    ]);
  }
  console.log(color.dim('  Every module the player imports is present'));

  if (args.skipChecks) {
    console.log(color.yellow('  ⚠ --skip-checks: the resolved config and the native cut were not verified.'));
    console.log(color.green(`\n✔ Staged: ${staged.outDir}`));
    return;
  }

  if (!linkNodeModules(staged.outDir)) {
    // Not skipped with a warning: the two checks below are the only evidence
    // that the config resolves and the native cut applies, and a run that
    // quietly stops performing them still prints a green tick.
    fail('Could not link node_modules into the staged project', [
      'The config and autolinking checks cannot run without it.',
      'Pass --skip-checks to stage anyway, knowing neither was verified.',
    ]);
  } else {
    const eas = JSON.parse(fs.readFileSync(path.join(staged.outDir, 'eas.json'), 'utf8')) as {
      build?: Record<string, { env?: Record<string, string> }>;
    };
    const checks: [string, () => CheckResult][] = [
      ...['player-apk', 'player-aab'].map((profile): [string, () => CheckResult] => [
        `Expo config (${profile})`,
        () => checkExpoConfig(staged.outDir, eas.build?.[profile]?.env ?? {}),
      ]),
      ['Native modules', () => checkAutolinking(staged.outDir)],
    ];
    for (const [label, check] of checks) {
      const result = check();
      if (!result.ok) fail(`${label} check failed`, result.detail);
      console.log(color.dim(`  ${label}: ${result.detail.join('; ')}`));
    }
  }

  console.log(color.green(`\n✔ Staged: ${staged.outDir}`));
  console.log(color.dim('  Build it with:'));
  console.log(color.dim(`    cd ${path.relative(process.cwd(), staged.outDir)}`));
  console.log(color.dim('    eas build --platform android --profile player-apk\n'));
}

void main();
