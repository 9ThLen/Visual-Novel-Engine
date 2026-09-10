import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import { userInfo } from 'node:os';

/**
 * Restrict the bridge's directory to the account that owns it, on Windows.
 *
 * The token and the settings file are written `0o600`, which Windows ignores.
 * They instead inherit the ACL of `%LOCALAPPDATA%`, and that was assumed to be
 * owner-only. It is not: on a real machine the inherited entries included a
 * group the owner never chose, so the file holding an author's API key was
 * readable by more than the author.
 *
 * `icacls` is how Windows itself does this, so nothing is added to the package
 * to get it. `/inheritance:r` drops the inherited entries rather than adding to
 * them — adding a grant to an ACL that already lets a group in changes nothing.
 */
export type AclResult =
  | { applied: true }
  | { applied: false; reason: string };

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
 * `(OI)(CI)F` so the files inside inherit it too: the point is the token and the
 * settings file, and granting only the directory would leave both as they were.
 */
export function icaclsArgs(dir: string, principal: string): string[] {
  return [dir, '/inheritance:r', '/grant:r', `${principal}:(OI)(CI)F`];
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

  const principal = ownerPrincipal(options.env ?? process.env, options.username ?? userInfo().username);
  const run = options.run ?? spawnSync;
  const result = run('icacls', icaclsArgs(dir, principal), { encoding: 'utf8', windowsHide: true });

  if (result.error) return { applied: false, reason: result.error.message };
  if (result.status !== 0) {
    return { applied: false, reason: result.stderr?.trim() || result.stdout?.trim() || `icacls exited ${result.status}` };
  }
  return { applied: true };
}
