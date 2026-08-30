/**
 * A static module graph over the project's own source, good enough to answer
 * one question: what does a bundle rooted here actually contain?
 *
 * Not a substitute for Metro — it neither transforms code nor understands
 * platform extensions the way the bundler does. What it does understand is the
 * import edges between this repo's own files, which is what a build-profile
 * boundary is made of. Bare specifiers stop the walk and are recorded as
 * external packages, because that set is the other half of the answer (which
 * native modules a profile can still autolink).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
/**
 * Metro resolves these before the bare extension. `app/reader.web.tsx` and
 * `app/reader.tsx` are one module to this walker: it reports the union, which
 * is the conservative answer for a boundary check.
 */
const PLATFORM_PREFIXES = ['.web', '.native', '.ios', '.android', ''];

/**
 * `import x from 'y'`, `export ... from 'y'`, `import('y')`, `require('y')`.
 *
 * The clause between `import` and `from` is matched with a class that excludes
 * quotes and semicolons rather than a lazy any-character run. The lazy run
 * crossed statement boundaries, so a side-effect `import 'a'` followed by any
 * later `... from 'b'` was read as a single import of `b` — and a side-effect
 * import is exactly how an authoring module reaches a bundle unnoticed.
 */
const IMPORT_PATTERNS = [
  /(?:^|[\n;{}])\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /(?:^|[\n;{}])\s*export\s+(?:[^'";]*?\s+from\s+)\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** `import type {…} from` and `export type {…} from` vanish at compile time. */
const TYPE_ONLY = /(?:^|[\n;{}])\s*(?:import|export)\s+type\s/;

function toPosix(value) {
  return value.split(sep).join('/');
}

function candidates(base) {
  const out = [];
  for (const platform of PLATFORM_PREFIXES) {
    for (const extension of SOURCE_EXTENSIONS) out.push(`${base}${platform}${extension}`);
  }
  for (const platform of PLATFORM_PREFIXES) {
    for (const extension of SOURCE_EXTENSIONS) out.push(`${base}/index${platform}${extension}`);
  }
  return out;
}

function resolveFile(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const candidate of candidates(base)) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Read one file's edges. Type-only lines are dropped: they carry no code into
 * the bundle, and treating them as edges would report the whole type surface of
 * the editor as "present in the player".
 */
export function readImports(file) {
  const source = readFileSync(file, 'utf8');
  const specifiers = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const statement = match[0];
      if (TYPE_ONLY.test(statement)) continue;
      specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

/**
 * Walk every module reachable from `entries`.
 *
 * @param {object} options
 * @param {string} options.projectRoot absolute path of the repo
 * @param {string[]} options.entries absolute paths of entry files
 * @param {Record<string, string>} [options.substitutions] repo-relative module
 *   swaps, mirroring a bundler alias — the key is never walked, the value is
 * @returns {{modules: Map<string, string|null>, externals: Set<string>, unresolved: {from: string, specifier: string}[]}}
 *   `modules` maps each repo-relative module to the repo-relative module that
 *   first pulled it in, so a violation can be reported as a chain rather than a
 *   bare filename.
 */
export function walkModuleGraph({ projectRoot, entries, substitutions = {} }) {
  const modules = new Map();
  const externals = new Set();
  const unresolved = [];
  const queue = [];

  for (const entry of entries) {
    const key = toPosix(relative(projectRoot, entry));
    if (modules.has(key)) continue;
    modules.set(key, null);
    queue.push(entry);
  }

  while (queue.length > 0) {
    const file = queue.shift();
    const fromKey = toPosix(relative(projectRoot, file));
    if (file.endsWith('.json')) continue;

    for (const specifier of readImports(file)) {
      let base;
      if (specifier.startsWith('@/')) base = resolve(projectRoot, specifier.slice(2));
      else if (specifier.startsWith('.')) base = resolve(dirname(file), specifier);
      else {
        externals.add(specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/'));
        continue;
      }

      const resolved = resolveFile(base);
      if (!resolved) {
        unresolved.push({ from: fromKey, specifier });
        continue;
      }
      let key = toPosix(relative(projectRoot, resolved));
      let target = resolved;
      if (substitutions[key]) {
        key = substitutions[key];
        target = resolve(projectRoot, key);
      }
      if (modules.has(key)) continue;
      modules.set(key, fromKey);
      queue.push(target);
    }
  }

  return { modules, externals, unresolved };
}

/** The chain from an entry down to `moduleKey`, for a legible failure message. */
export function importChain(modules, moduleKey) {
  const chain = [moduleKey];
  let current = modules.get(moduleKey);
  while (current) {
    chain.unshift(current);
    current = modules.get(current);
  }
  return chain;
}
