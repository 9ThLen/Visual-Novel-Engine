import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

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
 * The bridge's own directory. Pure: it computes a path and creates nothing, so
 * callers decide when a directory is worth bringing into existence.
 */
export function bridgeHomeDir(options: BridgeHomeOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();

  const override = env[BRIDGE_HOME_ENV]?.trim();
  if (override) {
    if (!isAbsolute(override)) {
      throw new Error(`${BRIDGE_HOME_ENV} must be an absolute path: ${override}`);
    }
    return override;
  }

  if (platform === 'win32') {
    const local = env.LOCALAPPDATA?.trim() || join(home, 'AppData', 'Local');
    return join(local, BRIDGE_DIR_NAME, BRIDGE_SUBDIR_NAME);
  }

  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', BRIDGE_DIR_NAME, BRIDGE_SUBDIR_NAME);
  }

  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, '.config');
  return join(base, 'visual-novel-engine', 'bridge');
}

/** `KEY=VALUE` settings, the same shape the repository `.env` already uses. */
export function bridgeConfigFile(dir: string): string {
  return join(dir, 'bridge.env');
}

/** The pairing token, kept apart from the settings so it can be rotated alone. */
export function bridgeTokenFile(dir: string): string {
  return join(dir, 'token');
}
