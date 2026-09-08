/**
 * The prebuilt player shell the studio ships beside itself.
 *
 * The studio cannot run a bundler, so it cannot compile a player. What it can do
 * is download one that was compiled with it — `scripts/build-web.mjs` writes
 * `player-shell-<version>.zip` and a descriptor into `dist/` — and inject a
 * story into it. That is the whole trick behind exporting a playable folder from
 * a browser tab.
 *
 * The version guard is the reason the descriptor exists rather than a bare
 * filename convention. A shell from a different engine build carries a different
 * reader, and a story exported into it would be played by code that never saw
 * this release's schema. Refusing costs an author one confusing moment;
 * shipping it costs a stranger a broken novel with no explanation.
 */
import { resolveWebUrl } from '@/lib/web-base-url';

/** Beside `index.html`. Mirrored by `scripts/build-web.mjs`. */
export const PLAYER_SHELL_DESCRIPTOR_PATH = 'player-shell.json';

export interface PlayerShellDescriptor {
  version: string;
  file: string;
  bytes: number;
  sha256: string;
  entries: number;
  builtAt?: string;
}

/** Why a shell cannot be used, in terms an author can act on. */
export type PlayerShellProblem =
  | { kind: 'missing' }
  | { kind: 'unreadable' }
  | { kind: 'version-mismatch'; shellVersion: string; engineVersion: string };

export function parsePlayerShellDescriptor(raw: unknown): PlayerShellDescriptor | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.version !== 'string' || !record.version) return null;
  if (typeof record.file !== 'string' || !record.file) return null;
  // A filename, not a path: the descriptor names a sibling of index.html, and
  // anything else would let a deployment point the studio somewhere unexpected.
  if (record.file.includes('/') || record.file.includes('\\') || record.file.includes('..')) return null;
  if (!Number.isSafeInteger(record.bytes) || (record.bytes as number) <= 0) return null;
  if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) return null;

  const descriptor: PlayerShellDescriptor = {
    version: record.version,
    file: record.file,
    bytes: record.bytes as number,
    sha256: record.sha256,
    entries: Number.isSafeInteger(record.entries) ? (record.entries as number) : 0,
  };
  if (typeof record.builtAt === 'string') descriptor.builtAt = record.builtAt;
  return descriptor;
}

/**
 * `null` when this build ships no shell — a dev server, or a deployment that
 * only ran `expo export`. That is not an error in itself; it is only an error
 * once someone asks to export.
 */
export async function loadPlayerShellDescriptor(): Promise<PlayerShellDescriptor | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch(resolveWebUrl(PLAYER_SHELL_DESCRIPTOR_PATH), { cache: 'no-store' });
    if (!response.ok) return null;
    // An SPA fallback answers a missing file with index.html; only trust JSON.
    if (!(response.headers.get('content-type') ?? '').includes('json')) return null;
    return parsePlayerShellDescriptor(await response.json());
  } catch {
    return null;
  }
}

/**
 * Whether a shell may be used by the running engine, or why not.
 *
 * Exact equality: the shell is built by the same command that built the studio,
 * so any difference means a deployment where the two halves came from different
 * commits.
 */
export function checkPlayerShell(
  descriptor: PlayerShellDescriptor | null,
  engineVersion: string,
): PlayerShellProblem | null {
  if (!descriptor) return { kind: 'missing' };
  if (descriptor.version !== engineVersion) {
    return { kind: 'version-mismatch', shellVersion: descriptor.version, engineVersion };
  }
  return null;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Download the shell and check it is the one the descriptor describes.
 *
 * The filename carries only the engine version, which does not change between
 * two builds of the same version — so a browser holding a stale copy would
 * happily serve it forever, and a length check alone cannot tell two builds of
 * the same size apart. The hash in the query string busts the cache when the
 * content changes, and the digest check is what makes the descriptor mean
 * something rather than merely accompany the file.
 */
export async function fetchPlayerShell(descriptor: PlayerShellDescriptor): Promise<Uint8Array> {
  const url = `${resolveWebUrl(descriptor.file)}?sha256=${descriptor.sha256.slice(0, 16)}`;
  const response = await fetch(url, { cache: 'default' });
  if (!response.ok) {
    throw new Error(`Could not download the player shell (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength !== descriptor.bytes) {
    throw new Error(
      `The player shell is ${bytes.byteLength} bytes but its descriptor says ${descriptor.bytes}`,
    );
  }

  // `crypto.subtle` is absent on an insecure origin. Refusing to build there
  // would break local development for no gain; the length check still stands.
  if (globalThis.crypto?.subtle) {
    const digest = toHex(await globalThis.crypto.subtle.digest('SHA-256', buffer));
    if (digest !== descriptor.sha256) {
      throw new Error(
        'The player shell does not match its descriptor. The deployment is serving a stale or altered file.',
      );
    }
  }
  return bytes;
}
