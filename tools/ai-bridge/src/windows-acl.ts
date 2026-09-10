import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import { userInfo } from 'node:os';

/**
 * Restrict the bridge's directory to the account that owns it, on Windows.
 *
 * The token and the settings file are written `0o600`, which Windows ignores.
 * They inherit the ACL of `%LOCALAPPDATA%`, and that was assumed to be
 * owner-only. It is not: on a real machine the inherited entries included a
 * group the owner never chose, so the file holding an author's API key was
 * readable by more than the author.
 *
 * `icacls` is how Windows itself does this, so nothing is added to the package
 * to get it. Two things it does *not* do, both of which cost a round to learn:
 *
 * - `/inheritance:r` removes inherited entries and leaves explicit ones alone;
 * - `/grant:r` replaces the grants of the principal it names, and nobody else's.
 *
 * So applying them proves nothing on a directory that already carried an
 * explicit entry for someone else. The ACL is read back and checked. A
 * guarantee that is not verified is the bug this exists to fix.
 *
 * What it deliberately does not do is delete other people's entries. Deciding
 * which principal is safe to remove means classifying names that are localised
 * and domain-qualified, and getting that wrong locks the author out of their own
 * directory — a worse outcome than the one being fixed. An entry that survives
 * `/inheritance:r` was put there explicitly by someone, so it is reported and
 * the bridge refuses, which puts the decision where it belongs.
 */
export type AclResult =
  | { applied: true }
  | { applied: false; reason: string };

/**
 * Principals that may remain besides the owner.
 *
 * Removing these is neither possible in practice nor useful: an administrator
 * can take ownership of any file, and SYSTEM is how backup and indexing reach
 * it. Excluding them would be security theatre. Everything else is not.
 */
const ALWAYS_PERMITTED = ['SYSTEM', 'ADMINISTRATORS'];

/**
 * The account name without its domain or machine prefix.
 *
 * `icacls` reports `MACHINE\ada` while the principal we grant may be the bare
 * `ada` — comparing the two as written marks the owner's own entry as a
 * stranger's, and the first version of this went on to try removing it.
 */
export function bareAccountName(principal: string): string {
  const separator = principal.lastIndexOf('\\');
  return (separator < 0 ? principal : principal.slice(separator + 1)).trim().toUpperCase();
}

/** The account to grant, qualified by domain when the shell says there is one. */
export function ownerPrincipal(
  env: Readonly<Record<string, string | undefined>> = process.env,
  username: string = userInfo().username,
): string {
  const domain = env.USERDOMAIN?.trim();
  // A domain equal to the machine name is a local account; icacls resolves the
  // bare name either way, and the qualified form is what fails on a machine
  // renamed since the profile was made.
  return domain && domain.toLowerCase() !== username.toLowerCase()
    ? `${domain}\\${username}`
    : username;
}

/**
 * `(OI)(CI)F` so the files inside inherit it: the point is the token and the
 * settings file, and granting only the directory would leave both as they were.
 */
export function icaclsArgs(dir: string, principal: string): string[] {
  return [dir, '/inheritance:r', '/grant:r', `${principal}:(OI)(CI)F`];
}

/**
 * The principals named in `icacls <dir>` output.
 *
 * Each entry is `PRINCIPAL:(perms)`, the first on the same line as the path and
 * the rest indented. The trailing summary line is localised, so lines are
 * matched by that structure rather than by any English in them.
 */
export function parseAclPrincipals(output: string, dir: string): string[] {
  const principals: string[] = [];
  for (const raw of output.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith(dir)) line = line.slice(dir.length).trim();
    const separator = line.indexOf(':(');
    if (separator <= 0) continue;
    principals.push(line.slice(0, separator).trim());
  }
  return principals;
}

/** Everything holding an entry that is neither the owner nor a system account. */
export function unexpectedPrincipals(principals: readonly string[], owner: string): string[] {
  const permitted = new Set([bareAccountName(owner), ...ALWAYS_PERMITTED]);
  return [...new Set(principals.filter(name => !permitted.has(bareAccountName(name))))];
}

export type AclRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

export function restrictDirectoryToOwner(
  dir: string,
  options: {
    platform?: NodeJS.Platform;
    env?: Readonly<Record<string, string | undefined>>;
    username?: string;
    run?: AclRunner;
  } = {},
): AclResult {
  const platform = options.platform ?? process.platform;
  // POSIX already got this right through the file mode.
  if (platform !== 'win32') return { applied: false, reason: 'not-windows' };

  const owner = ownerPrincipal(options.env ?? process.env, options.username ?? userInfo().username);
  const run = options.run ?? spawnSync;
  const icacls = (args: readonly string[]) => run('icacls', args, { encoding: 'utf8', windowsHide: true });

  const failureOf = (result: SpawnSyncReturns<string>): string | null => {
    if (result.error) return result.error.message;
    if (result.status !== 0) return result.stderr?.trim() || result.stdout?.trim() || `icacls exited ${result.status}`;
    return null;
  };

  const applied = icacls(icaclsArgs(dir, owner));
  const applyFailure = failureOf(applied);
  if (applyFailure) return { applied: false, reason: applyFailure };

  const read = () => {
    const result = icacls([dir]);
    const failure = failureOf(result);
    return failure ? { failure } : { principals: parseAclPrincipals(result.stdout ?? '', dir) };
  };

  const first = read();
  if ('failure' in first) return { applied: false, reason: `could not read the resulting ACL: ${first.failure}` };

  const remaining = unexpectedPrincipals(first.principals, owner);
  if (remaining.length > 0) {
    return { applied: false, reason: `these have explicit access and were not put there by this bridge: ${remaining.join(', ')}` };
  }
  return { applied: true };
}
