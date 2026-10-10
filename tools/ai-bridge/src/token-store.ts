import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { bridgeMcpTokenFile, bridgeTokenFile } from './config-paths';

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

/**
 * The two tokens the bridge keeps: the one the editor pairs with, and the one
 * an external agent presents at the MCP endpoint. They are stored the same way
 * and never stand in for each other.
 */
export type BridgeTokenKind = 'pairing' | 'mcp';

const TOKEN_FILES: Record<BridgeTokenKind, { file: (dir: string) => string; reset: string; holder: string }> = {
  pairing: { file: bridgeTokenFile, reset: '--reset-token', holder: 'the editor' },
  mcp: { file: bridgeMcpTokenFile, reset: '--reset-mcp-token', holder: 'your agent' },
};

function invalid(path: string, detail: string, kind: BridgeTokenKind = 'pairing'): never {
  const { reset, holder } = TOKEN_FILES[kind];
  throw new BridgeTokenError(
    `The bridge token file is ${detail}: ${path}\n`
    + `Refusing to replace it silently — a new token would disconnect ${holder} without saying why.\n`
    + `Run the bridge with ${reset} to issue a new one, then ${kind === 'pairing' ? 're-pair the editor' : 'give it to your agent'}.`,
  );
}

/** Reads the stored token, or `null` when none has been issued yet. */
export function readStoredToken(dir: string, kind: BridgeTokenKind = 'pairing'): string | null {
  const path = TOKEN_FILES[kind].file(dir);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const token = raw.trim();
  if (!token) invalid(path, 'empty', kind);
  if (!TOKEN_PATTERN.test(token)) invalid(path, 'not a valid token', kind);
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
export function readOrCreateToken(dir: string, kind: BridgeTokenKind = 'pairing'): { token: string; created: boolean } {
  const existing = readStoredToken(dir, kind);
  if (existing) return { token: existing, created: false };

  const path = TOKEN_FILES[kind].file(dir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = generateBridgeToken();
  try {
    writeFileSync(path, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return { token, created: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const won = readStoredToken(dir, kind);
    if (!won) invalid(path, 'unreadable after a concurrent write', kind);
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
export function resetStoredToken(dir: string, kind: BridgeTokenKind = 'pairing'): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = generateBridgeToken();
  writeFileSync(TOKEN_FILES[kind].file(dir), `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  return token;
}
