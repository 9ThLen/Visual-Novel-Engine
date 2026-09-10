import { STUDIO_ORIGINS, isStudioOrigin } from '../../../src/lib/ai/studio-origins';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  ...STUDIO_ORIGINS,
] as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * An origin the bridge will answer: a loopback dev server, or the installed
 * studio's own window.
 *
 * The studio's origin is matched exactly rather than by host, so it widens the
 * policy by the single string that was measured and by nothing adjacent to it.
 * It is not a loopback host — `tauri.localhost` resolves nowhere — and treating
 * it as one would admit every origin under that name.
 *
 * The structural checks apply to both: no credentials, no path, no query, no
 * fragment. `*`, `null` and an empty string are not URLs and fail here, which is
 * deliberate — an absent Origin header must never be answered, and the server's
 * exact-match lookup rejects `undefined` for the same reason.
 */
export function normalizeLoopbackOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid bridge origin: ${value}`);
  }

  const plain = (url.protocol === 'http:' || url.protocol === 'https:')
    && !url.username
    && !url.password
    && url.pathname === '/'
    && !url.search
    && !url.hash
    && url.href === `${url.origin}/`;

  if (!plain || !(LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) || isStudioOrigin(url.origin))) {
    throw new Error(`Bridge origin must be an exact loopback http/https origin: ${value}`);
  }

  return url.origin;
}

export function normalizeAllowedOrigins(values?: readonly string[]): string[] {
  const source = values ?? DEFAULT_ALLOWED_ORIGINS;
  return [...new Set(source.map(normalizeLoopbackOrigin))];
}

export function defaultAllowedOrigins(): string[] {
  return [...DEFAULT_ALLOWED_ORIGINS];
}
