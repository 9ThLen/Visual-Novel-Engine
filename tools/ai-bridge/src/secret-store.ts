import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Where the author's API key lives, and what protects it.
 *
 * It used to live in `bridge.env` in plain text. The directory ACL kept other
 * accounts out, and that is worth having, but it is one mistake deep: anything
 * that can read the file — a backup agent, a sync client, a support archive, an
 * administrator, or the author pasting the file into a bug report — gets a
 * working key. A key is worth money and is not revocable by deleting a file.
 *
 * So on Windows the key is sealed with DPAPI under the current user, through
 * `ConvertFrom-SecureString`. The ciphertext is useless on another machine and
 * to another account on this one, which is exactly the guarantee a plain file
 * cannot offer whatever its permissions say.
 *
 * There is no equivalent on POSIX that does not ask the author for a second
 * password, so there the file mode is the protection and the stored record says
 * so rather than implying a seal it does not have. That is the honest state, and
 * the studio installer is a Windows artefact.
 *
 * The plaintext never appears on a command line — a command line is readable by
 * every process on the machine — so it travels on standard input in both
 * directions.
 */
export type SecretProtection = 'dpapi' | 'file';

export interface ProtectedSecret {
  protection: SecretProtection;
  value: string;
}

export type SecretRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

export interface SecretOptions {
  platform?: NodeJS.Platform;
  run?: SecretRunner;
}

/** Reads the plaintext from stdin and prints the sealed blob. */
export function protectScript(): string {
  return [
    '$ErrorActionPreference = "Stop";',
    '$plain = [Console]::In.ReadToEnd();',
    'if ($plain.Length -eq 0) { throw "no value on standard input" };',
    'ConvertTo-SecureString -String $plain -AsPlainText -Force | ConvertFrom-SecureString',
  ].join(' ');
}

/** Reads the sealed blob from stdin and prints the plaintext, with no newline. */
export function unprotectScript(): string {
  return [
    '$ErrorActionPreference = "Stop";',
    '$blob = [Console]::In.ReadToEnd().Trim();',
    '$secure = ConvertTo-SecureString -String $blob;',
    '$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);',
    'try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)) }',
    'finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }',
  ].join(' ');
}

export function powershellArgs(script: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
}

function powershell(script: string, input: string, options: SecretOptions): string {
  const run = options.run ?? spawnSync;
  const result = run('powershell', powershellArgs(script), {
    encoding: 'utf8',
    windowsHide: true,
    input,
  });
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `powershell exited ${result.status}`);
  }
  return result.stdout ?? '';
}

/** Seals a value for this account, where the platform can. */
export function protectSecret(plain: string, options: SecretOptions = {}): ProtectedSecret {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return { protection: 'file', value: plain };

  const sealed = powershell(protectScript(), plain, options).trim();
  // A DPAPI blob is hex. Anything else means PowerShell printed something that
  // is not a secret, and storing it would lose the key while reporting success.
  if (!/^[0-9a-fA-F]{32,}$/.test(sealed)) {
    throw new Error('Windows returned no protected value for the key.');
  }
  return { protection: 'dpapi', value: sealed };
}

/** Opens a sealed value again. Only the account that sealed it can. */
export function revealSecret(stored: ProtectedSecret, options: SecretOptions = {}): string {
  if (stored.protection === 'file') return stored.value;
  const plain = powershell(unprotectScript(), stored.value, options);
  if (plain.length === 0) throw new Error('the protected value could not be opened');
  return plain;
}

interface SecretsFile {
  version: number;
  secrets: Record<string, ProtectedSecret>;
}

const CURRENT_VERSION = 1;

export function parseSecretsFile(raw: string): Record<string, ProtectedSecret> {
  const parsed = JSON.parse(raw) as Partial<SecretsFile>;
  const secrets = parsed?.secrets;
  if (!secrets || typeof secrets !== 'object') return {};
  const out: Record<string, ProtectedSecret> = {};
  for (const [name, entry] of Object.entries(secrets)) {
    const record = entry as Partial<ProtectedSecret>;
    if (typeof record?.value !== 'string') continue;
    if (record.protection !== 'dpapi' && record.protection !== 'file') continue;
    out[name] = { protection: record.protection, value: record.value };
  }
  return out;
}

export function serializeSecrets(secrets: Record<string, ProtectedSecret>): string {
  const file: SecretsFile = { version: CURRENT_VERSION, secrets };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** The stored records, or nothing at all when there is no store yet. */
export function readSecretsFile(path: string): Record<string, ProtectedSecret> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  try {
    return parseSecretsFile(raw);
  } catch {
    // A store that cannot be parsed is reported where it is opened, not here:
    // silently continuing without a key produces "the model refused" rather
    // than "your saved key is unreadable".
    throw new Error(`could not read the saved keys: ${path}`);
  }
}

export interface RevealedSecrets {
  values: Record<string, string>;
  /** Names that are stored but could not be opened, and why. */
  problems: string[];
}

/**
 * Every stored secret this account can open.
 *
 * One that cannot be opened is named rather than dropped. A key sealed by
 * another account, or restored from another machine's backup, decrypts to
 * nothing — and a bridge that quietly started without it would look like a
 * bridge whose provider rejects every request.
 */
export function revealStoredSecrets(path: string, options: SecretOptions = {}): RevealedSecrets {
  const values: Record<string, string> = {};
  const problems: string[] = [];
  for (const [name, stored] of Object.entries(readSecretsFile(path))) {
    try {
      values[name] = revealSecret(stored, options);
    } catch (error) {
      problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { values, problems };
}

/**
 * Writes one secret, keeping the others.
 *
 * `0o600` for POSIX; on Windows the directory's ACL decides, and the bridge
 * refuses to start at all when it could not set that.
 */
export function storeSecret(
  path: string,
  name: string,
  plain: string,
  options: SecretOptions = {},
): ProtectedSecret {
  const sealed = protectSecret(plain, options);
  const secrets = { ...readSecretsFile(path), [name]: sealed };
  writeFileSync(path, serializeSecrets(secrets), { encoding: 'utf8', mode: 0o600 });
  return sealed;
}
