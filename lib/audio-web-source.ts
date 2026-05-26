export function getBrowserSafeAudioUri(uri: string | null | undefined): string | null {
  if (!uri) return null;

  if (
    uri.startsWith('https://') ||
    uri.startsWith('http://') ||
    uri.startsWith('blob:') ||
    uri.startsWith('data:audio/')
  ) {
    return uri;
  }

  return null;
}
