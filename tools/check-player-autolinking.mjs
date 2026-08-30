/**
 * Checks the player profile's native-module exclusions against real autolinking.
 *
 * The list in `player-profile.js` cannot be applied from this repo: autolinking
 * reads `package.json`, which the studio build shares and which needs the
 * pickers. It is applied by R9's staged project, which gets a `package.json` of
 * its own. Until then the list is a promise nobody has kept, and this is what
 * stops it from rotting: it asks autolinking itself whether every excluded name
 * is a module this project actually links, and whether excluding them removes
 * them and nothing else.
 *
 * A misspelt or stale name is the failure mode worth catching. Autolinking does
 * not complain about excluding something that was never there — it silently
 * links everything, which is exactly what an earlier version of this profile did
 * for months by putting the list in a file autolinking never reads.
 *
 * Usage: node tools/check-player-autolinking.mjs [--platform android]
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { PLAYER_AUTOLINKING_EXCLUDE } = require('../player-profile.js');

const platformFlag = process.argv.indexOf('--platform');
const platform = platformFlag >= 0 ? process.argv[platformFlag + 1] : 'android';

function resolveModules(exclude = []) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(repoRoot, 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js'),
      'resolve', '-p', platform, '--json',
      ...exclude.flatMap((name) => ['--exclude', name]),
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error(`expo-modules-autolinking resolve failed (${result.status})`);
  }
  const start = result.stdout.indexOf('{');
  const parsed = JSON.parse(result.stdout.slice(start));
  return new Set((parsed.modules ?? []).map((module) => module.packageName));
}

console.log(`Checking player autolinking exclusions for ${platform}...`);

const linked = resolveModules();
const excluded = resolveModules(PLAYER_AUTOLINKING_EXCLUDE);

const problems = [];

// A name that is not linked in the first place excludes nothing. Either the
// dependency is gone and the entry is dead, or the name is wrong.
for (const name of PLAYER_AUTOLINKING_EXCLUDE) {
  if (!linked.has(name)) {
    problems.push(`"${name}" is not a module this project links — dead entry or wrong name`);
  } else if (excluded.has(name)) {
    problems.push(`"${name}" survives its own exclusion`);
  }
}

// Nothing else may disappear: an exclusion that takes a dependency of something
// the reader needs with it would be found on a device, not here.
for (const name of linked) {
  if (!excluded.has(name) && !PLAYER_AUTOLINKING_EXCLUDE.includes(name)) {
    problems.push(`excluding the list also removed "${name}", which is not on it`);
  }
}

if (problems.length > 0) {
  console.log('');
  console.log('FAIL: player autolinking exclusions do not describe reality');
  for (const problem of problems) console.log(`  ${problem}`);
  process.exit(1);
}

console.log(
  `Player autolinking check passed: ${linked.size} modules linked, ` +
  `${PLAYER_AUTOLINKING_EXCLUDE.length} excluded, ${excluded.size} left.`,
);
console.log(
  'Note: the exclusions are NOT applied by this repo — autolinking reads',
);
console.log(
  'package.json, which the studio shares. R9\'s staged project applies them.',
);
