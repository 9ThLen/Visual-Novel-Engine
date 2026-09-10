import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, win32, type PlatformPath } from 'node:path';

import { restrictDirectoryToOwner, type AclResult } from './windows-acl';

/**
 * Where an installed bridge keeps its configuration and its pairing token.
 *
 * The bridge used to read `.env` from `process.cwd()`, which is correct for
 * `pnpm ai-bridge` in a checkout and wrong for everything else: a user who
 * starts the packaged bridge from a shortcut, from `C:\`, or from their
 * Documents folder gets a different — usually empty — configuration each time,
 * and the failure looks like "the bridge forgot my API key" rather than like a
 * path bug.
 *
 * So the location is derived from the user's account, never from where the
 * process happened to start.
 */
export const BRIDGE_DIR_NAME = 'VisualNovelEngine';
export const BRIDGE_SUBDIR_NAME = 'Bridge';

/** Escape hatch for tests, portable installs and anyone with an opinion. */
export const BRIDGE_HOME_ENV = 'VNE_BRIDGE_HOME';

export interface BridgeHomeOptions {
  env?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  home?: string;
}

/**
 * Path semantics follow the platform being asked about, not the one running.
 *
 * In production those are the same. In a test they are not, and taking them from
 * the host is how two of these paths passed on Linux and CI and failed on
 * Windows — the only platform that actually ships this.
 */
function pathsFor(platform: NodeJS.Platform): PlatformPath {
  return platform === 'win32' ? win32 : posix;
}

/**
 * The bridge's own directory. Pure: it computes a path and creates nothing, so
 * callers decide when a directory is worth bringing into existence.
 */
export function bridgeHomeDir(options: BridgeHomeOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();

  const p = pathsFor(platform);

  const override = env[BRIDGE_HOME_ENV]?.trim();
  if (override) {
    if (!p.isAbsolute(override)) {
      throw new Error(`${BRIDGE_HOME_ENV} must be an absolute path: ${override}`);
    }
    return override;
  }

  if (platform === 'win32') {
    const local = env.LOCALAPPDATA?.trim() || p.join(home, 'AppData', 'Local');
    return p.join(local, BRIDGE_DIR_NAME, BRIDGE_SUBDIR_NAME);
  }

  if (platform === 'darwin') {
    return p.join(home, 'Library', 'Application Support', BRIDGE_DIR_NAME, BRIDGE_SUBDIR_NAME);
  }

  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && p.isAbsolute(xdg) ? xdg : p.join(home, '.config');
  return p.join(base, 'visual-novel-engine', 'bridge');
}

/** `KEY=VALUE` settings, the same shape the repository `.env` already uses. */
export function bridgeConfigFile(dir: string, platform: NodeJS.Platform = process.platform): string {
  return pathsFor(platform).join(dir, 'bridge.env');
}

/** The pairing token, kept apart from the settings so it can be rotated alone. */
export function bridgeTokenFile(dir: string, platform: NodeJS.Platform = process.platform): string {
  return pathsFor(platform).join(dir, 'token');
}

/**
 * Creates the bridge's directory and makes it the owner's alone.
 *
 * Called once before anything is written into it, so the token and the settings
 * file are created inside an already-restricted directory rather than being
 * tightened afterwards — a file that is briefly readable is readable.
 *
 * The mode covers POSIX. Windows ignores it and needs the ACL set explicitly:
 * `%LOCALAPPDATA%` was assumed to be owner-only and, on a real machine, was not.
 */
export function ensureBridgeHome(dir: string): AclResult {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // The secrets are named, not just the directory: a `token` that predates this
  // — or that someone gave an explicit entry — keeps its own ACL no matter what
  // the directory says, and checking only the directory missed exactly that.
  return restrictDirectoryToOwner(dir, {
    files: [bridgeTokenFile(dir), bridgeConfigFile(dir)],
  });
}
