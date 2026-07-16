const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
] as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeLoopbackOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid bridge origin: ${value}`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || url.href !== `${url.origin}/`
  ) {
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
