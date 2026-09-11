import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { bridgeTokenFile } from './config-paths';

/**
 * The pairing token, kept across restarts.
 *
 * `AiBridgeServer` mints a random token whenever it is not given one, which is
 * right for a dev server and wrong for an installed bridge: every restart would
 * invalidate the token the editor has stored, and the symptom — the editor
 * silently failing to connect after a reboot — reads as a broken product rather
 * than as an expired secret. So the token is generated once and reused.
 *
 * It is the same 24 random bytes the server would have generated; only its
 * lifetime changes.
 */
const TOKEN_BYTES = 24;
const TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export function generateBridgeToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export class BridgeTokenError extends Error {}

function invalid(path: string, detail: string): never {
  throw new BridgeTokenError(
    `The bridge token file is ${detail}: ${path}\n`
    + 'Refusing to replace it silently — a new token would disconnect the editor without saying why.\n'
    + 'Run the bridge with --reset-token to issue a new one, then re-pair the editor.',
  );
}

/** Reads the stored token, or `null` when none has been issued yet. */
export function readStoredToken(dir: string): string | null {
  const path = bridgeTokenFile(dir);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const token = raw.trim();
  if (!token) invalid(path, 'empty');
  if (!TOKEN_PATTERN.test(token)) invalid(path, 'not a valid token');
  return token;
}

/**
 * The stored token, issuing one on first run.
 *
 * Written with `wx` rather than a read-then-write, so two bridges started at the
 * same moment cannot each mint a token and leave the editor paired with whichever
 * lost the race: the loser gets `EEXIST` and adopts the winner's token.
 *
 * `0o600` is honoured on POSIX. Windows ignores the mode, where the file instead
 * inherits the ACL of the per-user directory it sits in — which is protection
 * worth verifying on a real machine rather than assuming here.
 */
export function readOrCreateToken(dir: string): { token: string; created: boolean } {
  const existing = readStoredToken(dir);
  if (existing) return { token: existing, created: false };

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = generateBridgeToken();
  try {
    writeFileSync(bridgeTokenFile(dir), `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return { token, created: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const won = readStoredToken(dir);
    if (!won) invalid(bridgeTokenFile(dir), 'unreadable after a concurrent write');
    return { token: won, created: false };
  }
}

/**
 * Issues a new token, invalidating the old one.
 *
 * Rotating the file does not disturb a bridge that is already running — it holds
 * its token in memory — so the caller must say that the bridge has to be
 * restarted. That restart is what actually closes the sessions authenticated
 * with the old token.
 */
export function resetStoredToken(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = generateBridgeToken();
  writeFileSync(bridgeTokenFile(dir), `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  return token;
}
