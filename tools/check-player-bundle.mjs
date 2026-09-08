/**
 * Fails when an authoring module is reachable from the player build's route
 * root.
 *
 * The player profile makes three separate promises, and only the first two are
 * enforced by tooling that runs anyway: Expo Router crawls `app-player/` so the
 * studio's routes are never required, and Metro refuses to resolve the
 * authoring trees. The third promise — that nothing the reader *does* import
 * drags an authoring module in behind it — is invisible until someone adds one
 * import to a shared screen. That is what this checks.
 *
 * It walks the same graph Metro would (see `tools/lib/module-graph.mjs`),
 * applying the player store substitution, and reports the import chain rather
 * than the filename: knowing that `lib/story-snapshots.ts` is in the bundle is
 * useless without knowing which reader screen pulled it in.
 *
 * Usage: node tools/check-player-bundle.mjs [--report]
 */
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { importChain, walkModuleGraph } from './lib/module-graph.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  PLAYER_ROUTER_ROOT,
  PLAYER_BLOCKED_TREES,
  PLAYER_FORBIDDEN_MODULES,
  PLAYER_MODULE_SUBSTITUTIONS,
} = require('../player-profile.js');

const report = process.argv.includes('--report');
const routerRoot = PLAYER_ROUTER_ROOT.replace(/^\.\//, '');

process.chdir(repoRoot);
const entries = globSync(`${routerRoot}/**/*.{ts,tsx}`).map((file) => resolve(repoRoot, file));
if (entries.length === 0) {
  console.error(`FAIL: no routes found under ${routerRoot}/`);
  process.exit(1);
}

const { modules, externals, unresolved } = walkModuleGraph({
  projectRoot: repoRoot,
  entries,
  substitutions: Object.fromEntries(
    PLAYER_MODULE_SUBSTITUTIONS.map((entry) => [entry.from, entry.to]),
  ),
});

const forbidden = new Set(PLAYER_FORBIDDEN_MODULES);
const violations = [];
for (const moduleKey of modules.keys()) {
  const inBlockedTree = PLAYER_BLOCKED_TREES.some(
    (tree) => moduleKey === tree || moduleKey.startsWith(`${tree}/`),
  );
  if (inBlockedTree || forbidden.has(moduleKey)) violations.push(moduleKey);
}

if (report) {
  console.log(`Player root: ${routerRoot}/ (${entries.length} route files)`);
  console.log(`Modules reachable: ${modules.size}`);
  console.log(`Packages reachable: ${externals.size}`);
  console.log([...externals].sort().join(', '));
}

if (unresolved.length > 0) {
  // A specifier this walker cannot resolve is a hole in the check, not a pass.
  console.log('');
  console.log('FAIL: unresolved imports — the graph is incomplete, so the check is not conclusive');
  for (const { from, specifier } of unresolved) console.log(`  ${from} -> ${specifier}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.log('');
  console.log(`FAIL: ${violations.length} authoring module(s) reachable from ${routerRoot}/`);
  for (const moduleKey of violations) {
    console.log('');
    console.log(`  ${moduleKey}`);
    console.log(`    ${importChain(modules, moduleKey).join('\n      -> ')}`);
  }
  console.log('');
  console.log('Either the reader should not need it, or it is shared code sitting in an');
  console.log('authoring directory — in which case move it out rather than widening the list.');
  process.exit(1);
}

console.log(`Player bundle boundary check passed (${modules.size} modules, ${externals.size} packages).`);
