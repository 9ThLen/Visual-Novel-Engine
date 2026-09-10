/**
 * Which audio URIs a browser can actually load.
 *
 * The point of the filter is a native-only path — an Android cache file, say —
 * reaching an `<audio>` element on a page served over http, where it can never
 * load. It is not a general allowlist of schemes: a same-origin path is exactly
 * as playable as an absolute URL, and rejecting one silently costs the story
 * its sound.
 */

/** `scheme:` per RFC 3986. Its absence is what makes a reference relative. */
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function documentProtocol(): string | null {
  if (typeof location === 'undefined') return null;
  return location.protocol;
}

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

  // A page opened from disk — the exported player, double-clicked — resolves
  // its own packaged media to `file://`. That is the page's own origin there,
  // and the only copy of the file that exists; the native cache path this
  // filter exists to stop is still rejected, because a served page is not on
  // `file:`.
  if (uri.startsWith('file://')) {
    return documentProtocol() === 'file:' ? uri : null;
  }

  // Protocol-relative (`//host/track.mp3`) names another origin despite having
  // no scheme, so it does not get the same-origin benefit of the doubt.
  if (uri.startsWith('//')) return null;

  // No scheme at all: a relative or root-relative path, which the browser
  // resolves against this document. Bundled assets arrive this way
  // (`/assets/?unstable_path=…`), and dropping them left every bundled track
  // silent on web.
  if (!SCHEME.test(uri)) return uri;

  return null;
}
