/** Resolve a public web file against Expo's deployed base path. */
export function resolveWebUrl(relativePath: string): string {
  const normalizedPath = relativePath.replace(/^\/+/, '');
  if (typeof document === 'undefined') return normalizedPath;

  const entryScript = document.querySelector<HTMLScriptElement>('script[src*="/_expo/"]');
  const entryUrl = entryScript?.src;
  const expoSegment = entryUrl?.indexOf('/_expo/') ?? -1;
  if (entryUrl && expoSegment >= 0) {
    try {
      return new URL(normalizedPath, entryUrl.slice(0, expoSegment + 1)).toString();
    } catch {
      /* fall through */
    }
  }

  try {
    return new URL(normalizedPath, document.baseURI).toString();
  } catch {
    return normalizedPath;
  }
}
