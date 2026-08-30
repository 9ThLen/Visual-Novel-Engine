/**
 * Is this directory safe to empty?
 *
 * Three commands write into a directory they clear first — the web exporter, the
 * desktop stager and the Android stager — and the argument that decides which
 * directory comes from a command line. The check lives here rather than in each
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

/**
 * Dropped into every directory these tools empty, so a re-run can tell its own
 * output from someone's source tree. Written after clearing, read before.
 */
export const OUTPUT_MARKER = '.vne-output';

const MARKER_CONTENTS = `Written by a Visual Novel Engine build command.
This directory is emptied and rewritten on every run; nothing here is a source
of truth. The file's presence is what tells the next run it may do that.
`;

/** True when `ancestor` strictly contains `descendant` on the filesystem. */
export function isAncestor(ancestor: string, descendant: string): boolean {
  const rel = path.relative(ancestor, descendant);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export interface OutPathOptions {
  repoRoot: string;
  cwd?: string;
}

/**
 * `null` when the path may be emptied and written to, a reason when it may not.
 */
export function outPathProblem(outPath: string, options: OutPathOptions): string | null {
  const cwd = options.cwd ?? process.cwd();
  if (outPath === path.parse(outPath).root) return 'it is a filesystem root';
  if (outPath === options.repoRoot) return 'it is the repository root';
  if (outPath === cwd) return 'it is the current directory';
  if (isAncestor(outPath, options.repoRoot)) return 'it contains the repository';
  if (isAncestor(outPath, cwd)) return 'it contains the current directory';

  let entries: string[];
  try {
    entries = fs.readdirSync(outPath);
  } catch {
    // Missing is the ordinary case, and a file where a directory should be is
    // caught by the write that follows.
    return null;
  }
  if (entries.length === 0) return null;
  if (entries.includes(OUTPUT_MARKER)) return null;
  return `it already holds ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} `
    + 'that no build command wrote';
}

export function assertSafeOutPath(outPath: string, options: OutPathOptions): void {
  const problem = outPathProblem(outPath, options);
  if (problem) {
    throw new Error(
      `Refusing to use "${outPath}" as an output directory: ${problem}. `
      + 'It is emptied before writing, so it must be a new or previously generated folder.',
    );
  }
}

/** Empty the directory and claim it, so the next run knows it may do this again. */
export function prepareOutPath(outPath: string, options: OutPathOptions): void {
  assertSafeOutPath(outPath, options);
  fs.rmSync(outPath, { recursive: true, force: true });
  fs.mkdirSync(outPath, { recursive: true });
  fs.writeFileSync(path.join(outPath, OUTPUT_MARKER), MARKER_CONTENTS);
}
