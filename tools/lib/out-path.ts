/**
 * Is this directory safe to empty?
 *
 * Three commands replace generated output — the web exporter, the desktop
 * stager and the Android stager — and the argument that decides which directory
 * comes from a command line. The check lives here rather than in each
 * of them because a destructive guard that exists in three copies is a guard
 * that will eventually exist in two.
 *
 * **The rule this originally got wrong.** It refused a filesystem root, the
 * repository, the current directory and anything containing either — which
 * catches `--out .` and `--out ..` and nothing else. `--out ./assets` sailed
 * through and deleted the art. Naming a path is not the same as consenting to
 * lose what is already there, so the rule is now about the *contents*: an empty
 * or absent directory is fair game, one this tool wrote before is fair game, and
 * anything else has to be removed by the person who owns it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Dropped into every directory these tools empty, so a re-run can tell its own
 * output from someone's source tree. Written after clearing, read before.
 */
export const OUTPUT_MARKER = '.vne-output';

const OUTPUT_MARKER_VERSION = 1;

/** True when `ancestor` strictly contains `descendant` on the filesystem. */
export function isAncestor(ancestor: string, descendant: string): boolean {
  const rel = path.relative(ancestor, descendant);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export interface OutPathOptions {
  repoRoot: string;
  cwd?: string;
  /** Inputs that must survive staging. Output may neither contain nor sit inside one. */
  inputs?: string[];
}

/** Resolve through junctions/symlinks even when the last path components do not exist yet. */
function physicalPath(candidate: string): string {
  const resolved = path.resolve(candidate);
  let existing = resolved;
  const missing: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const real = fs.realpathSync.native(existing);
  return path.resolve(real, ...missing);
}

function sameOrAncestor(ancestor: string, descendant: string): boolean {
  return ancestor === descendant || isAncestor(ancestor, descendant);
}

function expectedMarkerContents(outPath: string): string {
  return `${JSON.stringify({
    kind: 'visual-novel-engine-output',
    version: OUTPUT_MARKER_VERSION,
    path: physicalPath(outPath),
  })}\n`;
}

function hasValidMarker(outPath: string): boolean {
  const marker = path.join(outPath, OUTPUT_MARKER);
  try {
    const stat = fs.lstatSync(marker);
    return stat.isFile()
      && !stat.isSymbolicLink()
      && fs.readFileSync(marker, 'utf8') === expectedMarkerContents(outPath);
  } catch {
    return false;
  }
}

/**
 * `null` when the path may be emptied and written to, a reason when it may not.
 */
export function outPathProblem(outPath: string, options: OutPathOptions): string | null {
  const physicalOut = physicalPath(outPath);
  const cwd = physicalPath(options.cwd ?? process.cwd());
  const repoRoot = physicalPath(options.repoRoot);
  if (physicalOut === path.parse(physicalOut).root) return 'it is a filesystem root';
  if (physicalOut === repoRoot) return 'it is the repository root';
  if (physicalOut === cwd) return 'it is the current directory';
  if (isAncestor(physicalOut, repoRoot)) return 'it contains the repository';
  if (isAncestor(physicalOut, cwd)) return 'it contains the current directory';
  for (const input of options.inputs ?? []) {
    const physicalInput = physicalPath(input);
    if (sameOrAncestor(physicalOut, physicalInput)) return `it contains input "${input}"`;
    if (sameOrAncestor(physicalInput, physicalOut)) return `it is inside input "${input}"`;
  }

  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(outPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return `it cannot be inspected: ${(error as Error).message}`;
  }
  if (stat.isSymbolicLink()) return 'it is a symbolic link or junction';
  if (!stat.isDirectory()) return 'it is not a directory';

  const entries = fs.readdirSync(outPath);
  if (entries.length === 0) return null;
  if (hasValidMarker(outPath)) return null;
  return `it already holds ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} `
    + 'without a valid build marker';
}

export function assertSafeOutPath(outPath: string, options: OutPathOptions): void {
  const problem = outPathProblem(outPath, options);
  if (problem) {
    throw new Error(
      `Refusing to use "${outPath}" as an output directory: ${problem}. `
      + 'It is replaced after staging, so it must be a new or previously generated folder.',
    );
  }
}

export interface OutPathTransaction {
  /** Fresh sibling directory to write and verify before replacing the destination. */
  workPath: string;
  commit(): void;
  abort(): void;
}

/** Keep the last good output intact until its replacement is complete. */
export function beginOutPath(outPath: string, options: OutPathOptions): OutPathTransaction {
  const finalPath = path.resolve(outPath);
  assertSafeOutPath(finalPath, options);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  const workPath = fs.mkdtempSync(path.join(path.dirname(finalPath), `.${path.basename(finalPath)}.tmp-`));
  let finished = false;

  return {
    workPath,
    commit() {
      if (finished) throw new Error('The output transaction is already finished.');
      assertSafeOutPath(finalPath, options);
      // workPath is a fresh directory owned by this transaction. It may itself
      // contain the marker of a nested staging transaction; replace that marker
      // with the identity of the final destination before the atomic rename.
      fs.writeFileSync(path.join(workPath, OUTPUT_MARKER), expectedMarkerContents(finalPath));

      const backup = `${finalPath}.previous-${randomUUID()}`;
      const hadPrevious = fs.existsSync(finalPath);
      try {
        if (hadPrevious) fs.renameSync(finalPath, backup);
        fs.renameSync(workPath, finalPath);
      } catch (error) {
        if (!fs.existsSync(finalPath) && hadPrevious && fs.existsSync(backup)) {
          fs.renameSync(backup, finalPath);
        }
        throw error;
      }
      if (hadPrevious) fs.rmSync(backup, { recursive: true, force: true });
      finished = true;
    },
    abort() {
      if (finished) return;
      fs.rmSync(workPath, { recursive: true, force: true });
      finished = true;
    },
  };
}
