/**
 * Is this directory safe to empty?
 *
 * Both publishing scripts write into a directory they clear first, and the
 * argument that decides which directory comes from a command line. `--out .`
 * resolves to the repository; `--out ..` resolves to whatever is above it. The
 * check lives here rather than in either script because a destructive guard that
 * exists in two copies is a guard that will eventually exist in one.
 */
import path from 'node:path';

/** True when `ancestor` strictly contains `descendant` on the filesystem. */
export function isAncestor(ancestor, descendant) {
  const rel = path.relative(ancestor, descendant);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * `null` when the path may be emptied and written to, a reason when it may not.
 * The output has to be its own folder: not a drive root, not the repository, not
 * the current directory, and not anything containing either.
 */
export function outPathProblem(outPath, { repoRoot, cwd = process.cwd() }) {
  if (outPath === path.parse(outPath).root) return 'it is a filesystem root';
  if (outPath === repoRoot) return 'it is the repository root';
  if (outPath === cwd) return 'it is the current directory';
  if (isAncestor(outPath, repoRoot)) return 'it contains the repository';
  if (isAncestor(outPath, cwd)) return 'it contains the current directory';
  return null;
}

export function assertSafeOutPath(outPath, options) {
  const problem = outPathProblem(outPath, options);
  if (problem) {
    throw new Error(
      `Refusing to use "${outPath}" as an output directory: ${problem}. `
      + 'It is emptied before writing, so it must be a dedicated folder.',
    );
  }
}
