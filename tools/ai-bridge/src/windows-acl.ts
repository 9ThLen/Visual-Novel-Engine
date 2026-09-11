import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';

/**
 * Restrict the bridge's directory and secrets to the account that owns them, on
 * Windows, and prove it afterwards.
 *
 * The files are written `0o600`, which Windows ignores; they inherit the ACL of
 * `%LOCALAPPDATA%`, which was assumed owner-only and, on a real machine, was
 * not. Three rounds of this were wrong in instructive ways, and each mistake is
 * why the code looks as it does:
 *
 * - Applying `/inheritance:r /grant:r` and reporting success. It proves nothing:
 *   the first flag removes inherited entries only, the second replaces the
 *   grants of the principal it names and nobody else's.
 * - Checking the result by account *name*. `DOMAIN-A\anna` and `DOMAIN-B\anna`
 *   are different people who compare equal, and `SYSTEM` and `Administrators`
 *   are English strings that a localised Windows does not use. Windows
 *   identifies accounts by SID; so does this.
 * - Checking the directory alone. A `token` that predates this, or that someone
 *   gave an explicit entry, keeps its own ACL regardless of the directory's.
 */
export type AclResult =
  | { applied: true }
  | { applied: false; reason: string };

/**
 * SIDs that may hold an entry besides the owner.
 *
 * `S-1-5-18` is Local System and `S-1-5-32-544` is the built-in Administrators
 * group. Removing either is neither possible in practice nor useful — an
 * administrator can take ownership of any file — and both are the same numbers
 * in every language Windows ships in, which is the point of using SIDs.
 */
export const PERMITTED_SIDS = ['S-1-5-18', 'S-1-5-32-544'] as const;

export interface AclEntry {
  path: string;
  /** True when inherited entries are blocked on this path. */
  protected: boolean;
  sids: string[];
}

export interface AclInspection {
  ownerSid: string;
  entries: AclEntry[];
}

/**
 * PowerShell that reports the ACLs as SIDs.
 *
 * `icacls` prints localised names; `Get-Acl` hands back identities that
 * translate to SIDs, and says whether inheritance is blocked. One call covers
 * the directory and every secret in it, because checking the directory alone was
 * the previous round's gap.
 */
export function inspectionScript(paths: readonly string[]): string {
  const list = paths.map(path => `'${path.replace(/'/g, "''")}'`).join(',');
  return [
    '$ErrorActionPreference = "Stop";',
    '$entries = @();',
    `foreach ($p in @(${list})) {`,
    '  if (Test-Path -LiteralPath $p) {',
    '    $acl = Get-Acl -LiteralPath $p;',
    '    $sids = @($acl.Access | ForEach-Object {',
    '      try { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value }',
    '      catch { $_.IdentityReference.Value } });',
    '    $entries += [pscustomobject]@{ path = $p; protected = [bool]$acl.AreAccessRulesProtected; sids = $sids };',
    '  } };',
    '[pscustomobject]@{',
    '  owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;',
    '  entries = @($entries)',
    '} | ConvertTo-Json -Depth 4 -Compress',
  ].join(' ');
}

export function powershellArgs(script: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
}

/**
 * Reads the inspection back.
 *
 * Windows PowerShell collapses a one-element array into a bare object, so both
 * shapes are accepted. An unparsable or ownerless result is an error rather than
 * an empty success: a parser that recognised nothing previously read as "nobody
 * has access", which is the most dangerous thing it could have concluded.
 */
export function parseInspection(json: string): AclInspection {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(`could not read the ACL report: ${json.trim().slice(0, 200) || '(no output)'}`);
  }
  const value = raw as { owner?: unknown; entries?: unknown };
  if (typeof value?.owner !== 'string' || !/^S-1-/.test(value.owner)) {
    throw new Error('the ACL report named no owner SID');
  }
  const rows = value.entries === undefined || value.entries === null
    ? []
    : Array.isArray(value.entries) ? value.entries : [value.entries];

  const entries = rows.map(row => {
    const entry = row as { path?: unknown; protected?: unknown; sids?: unknown };
    if (typeof entry?.path !== 'string') throw new Error('the ACL report carried an entry with no path');
    const sids = entry.sids === undefined || entry.sids === null
      ? []
      : Array.isArray(entry.sids) ? entry.sids : [entry.sids];
    if (sids.length === 0) {
      throw new Error(`the ACL report listed no entries at all for ${entry.path}`);
    }
    return {
      path: entry.path,
      protected: entry.protected === true,
      sids: sids.map(String),
    };
  });
  return { ownerSid: value.owner, entries };
}

/** SIDs holding access that are neither the owner nor a permitted system account. */
export function unexpectedSids(sids: readonly string[], ownerSid: string): string[] {
  const permitted = new Set<string>([ownerSid, ...PERMITTED_SIDS]);
  return [...new Set(sids.filter(sid => !permitted.has(sid)))];
}

/** Everything wrong with an inspection, in words that name the path. */
export function inspectionProblems(inspection: AclInspection, expectedPaths: readonly string[]): string[] {
  const problems: string[] = [];
  for (const entry of inspection.entries) {
    const unexpected = unexpectedSids(entry.sids, inspection.ownerSid);
    if (unexpected.length > 0) {
      problems.push(`${entry.path} is also accessible to ${unexpected.join(', ')}`);
    }
    if (!entry.protected) {
      problems.push(`${entry.path} still inherits permissions from the folders above it`);
    }
  }
  // A path that exists but produced no row means the report skipped it, and a
  // silently skipped secret is the failure this whole function exists to catch.
  const reported = new Set(inspection.entries.map(entry => entry.path));
  for (const path of expectedPaths) {
    if (!reported.has(path)) problems.push(`${path} was not reported on`);
  }
  return problems;
}

/** Asks Windows for the running account's SID, which is its only unambiguous name. */
export function ownerSidScript(): string {
  return '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value';
}

export function parseOwnerSid(output: string): string {
  const sid = output.trim();
  // `S-1-5-21-…` for a real account. Anything else means the call did not do
  // what it was asked, and granting to a mangled principal would silently grant
  // to nobody while reporting success.
  if (!/^S-1-[\d-]+$/.test(sid)) {
    throw new Error(`could not determine your account SID: ${sid.slice(0, 200) || '(no output)'}`);
  }
  return sid;
}

export function icaclsArgs(dir: string, ownerSid: string): string[] {
  // Granted by SID: a localised Windows names the same account differently, and
  // a bare username is ambiguous across two domains that both have an `anna`.
  // `(OI)(CI)` so files created inside inherit it — the point is the secrets.
  return [dir, '/inheritance:r', '/grant:r', `*${ownerSid}:(OI)(CI)F`];
}

/** Makes an existing file take the directory's ACL instead of whatever it has. */
export function resetChildArgs(file: string): string[] {
  return [file, '/reset'];
}

export type AclRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

export interface RestrictOptions {
  /** Secrets inside the directory that must be checked, not only the directory. */
  files?: readonly string[];
  platform?: NodeJS.Platform;
  run?: AclRunner;
}

function failureOf(result: SpawnSyncReturns<string>): string | null {
  if (result.error) return result.error.message;
  if (result.status !== 0) return result.stderr?.trim() || result.stdout?.trim() || `exited ${result.status}`;
  return null;
}

export function restrictDirectoryToOwner(dir: string, options: RestrictOptions = {}): AclResult {
  const platform = options.platform ?? process.platform;
  // POSIX already got this right through the file mode.
  if (platform !== 'win32') return { applied: false, reason: 'not-windows' };

  const run = options.run ?? spawnSync;
  const files = options.files ?? [];
  const exec = (command: string, args: readonly string[]) =>
    run(command, args, { encoding: 'utf8', windowsHide: true });

  const identity = exec('powershell', powershellArgs(ownerSidScript()));
  const identityFailure = failureOf(identity);
  if (identityFailure) return { applied: false, reason: `could not read your account SID: ${identityFailure}` };

  let ownerSid: string;
  try {
    ownerSid = parseOwnerSid(identity.stdout ?? '');
  } catch (error) {
    return { applied: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const applied = exec('icacls', icaclsArgs(dir, ownerSid));
  const applyFailure = failureOf(applied);
  if (applyFailure) return { applied: false, reason: `icacls: ${applyFailure}` };

  // An existing secret keeps its own ACL until it is told to take the folder's.
  for (const file of files) {
    const reset = exec('icacls', resetChildArgs(file));
    const failure = failureOf(reset);
    // A file that is not there yet is not a problem; it will be created inside
    // an already-restricted directory.
    if (failure && !/cannot find|does not exist|не зна|не найд/i.test(failure)) {
      return { applied: false, reason: `icacls ${file}: ${failure}` };
    }
  }

  const inspected = exec('powershell', powershellArgs(inspectionScript([dir, ...files])));
  const inspectFailure = failureOf(inspected);
  if (inspectFailure) return { applied: false, reason: `could not read the resulting ACL: ${inspectFailure}` };

  let inspection: AclInspection;
  try {
    inspection = parseInspection(inspected.stdout ?? '');
  } catch (error) {
    return { applied: false, reason: error instanceof Error ? error.message : String(error) };
  }

  // Only paths that exist are reported on, and only the directory is guaranteed
  // to exist at this point.
  const problems = inspectionProblems(inspection, [dir]);
  return problems.length === 0 ? { applied: true } : { applied: false, reason: problems.join('; ') };
}
