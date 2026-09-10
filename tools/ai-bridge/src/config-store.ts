import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

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

/**
 * The settings file a first run leaves behind.
 *
 * On a machine that has never seen this project, "put your API key in the
 * settings file" is not an instruction anyone can follow: there is no file, and
 * the directory it belongs in is one nobody has opened. So the first run writes
 * a commented template and says where it is. Every line is commented out, so the
 * file parses to no settings at all until a person edits it.
 *
 * The provider is named in the template because the built-in default is
 * `claude`, which needs a separately installed CLI. On a bare Windows machine
 * that default exits immediately, and the first thing the author would see is a
 * failure about software they have never heard of.
 */
export function settingsTemplate(): string {
  return [
    '# Visual Novel Engine — AI bridge settings',
    '#',
    '# Remove the # from a line to use it. Restart the bridge after saving.',
    '# Anything set in the environment, or passed on the command line, wins over',
    '# this file.',
    '',
    '# Which service answers. "openai" and "gemini" need only the key below.',
    '# "claude" and "codex" additionally need their own CLI installed and signed in.',
    '#AI_BRIDGE_PROVIDER=openai',
    '',
    '# Your key. Read by this bridge alone: it is never sent to the studio.',
    '#OPENAI_API_KEY=',
    '#GEMINI_API_KEY=',
    '',
    '# Optional: pin a model instead of the service default.',
    '#OPENAI_CHAT_MODEL=',
    '#GEMINI_CHAT_MODEL=',
    '',
    '# Optional: listen somewhere other than 8787.',
    '#AI_BRIDGE_PORT=8787',
    '',
  ].join('\n');
}

/**
 * Writes the template when no settings file exists yet, and reports whether it
 * did. Never touches a file that is already there — an author's key is not ours
 * to overwrite, and an exclusive create means two bridges starting together
 * cannot race into a half-written one.
 */
export function ensureSettingsTemplate(path: string): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // `0o600`, like the token: this is the file the author's API key goes into,
    // so it is the more sensitive of the two, not the less.
    writeFileSync(path, settingsTemplate(), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}
