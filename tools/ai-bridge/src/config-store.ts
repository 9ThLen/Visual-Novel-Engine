import { readFileSync } from 'node:fs';

/**
 * `KEY=VALUE` settings, in the format the repository `.env` already uses.
 *
 * Kept deliberately small: this exists so the bridge can read four or five keys
 * from a file the user owns, not so it can grow a configuration language. It is
 * the parser `main.ts` used inline for the repository `.env`, lifted out so the
 * packaged bridge and a checkout read the same syntax rather than two dialects
 * that drift.
 */
export function parseEnvFile(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

/** Reads a settings file, treating "not there" as "no settings". */
export function readEnvFile(path: string): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Fills in keys the target does not already have.
 *
 * Every layer is applied through this, so precedence falls out of call order
 * rather than out of a comparison someone has to keep correct: whoever writes
 * first wins, and the real environment — written by the shell before the
 * process started — always wins over a file.
 */
export function applyEnvDefaults(
  target: Record<string, string | undefined>,
  source: Readonly<Record<string, string>>,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined) target[key] = value;
  }
}
