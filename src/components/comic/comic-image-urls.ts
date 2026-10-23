/**
 * Pictures for the comic frame: a story's asset reference made a URL the
 * frame's own document can load.
 *
 * The novel hands an image component a module number or a URI and lets it
 * decide; the frame is a separate HTML document, so it needs a URL:
 *  - web / desktop: a blob: URL for media kept in IndexedDB (leased, so the
 *    resolver does not revoke it while the frame shows it), or the bundled
 *    file's URL made absolute — a srcdoc frame resolves relative URLs against
 *    its parent, but an absolute one cannot be misread;
 *  - Android: the media library's file:// path; a release build's bundled art
 *    as file:///android_res/drawable/<name>, which WebView reads straight from
 *    the APK (COMIC-RENDERER-SPIKE.md: expo-asset's `localUri` there is a bare
 *    drawable name and every image failed to load); in a dev build, Metro's URL.
 */
import { Asset } from 'expo-asset';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform } from 'react-native';

import { acquireResolvedAssetUri, type ResolvedAssetLease } from '@/lib/asset-resolver';

function hasScheme(uri: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(uri);
}

function absolute(uri: string): string {
  if (typeof window === 'undefined' || /^(blob|data):/i.test(uri)) return uri;
  try {
    return new URL(uri, window.location.href).href;
  } catch {
    return uri;
  }
}

/** A frame URL for what the resolver gave, or null when there is none to load. */
export function comicFrameUrlFor(source: string | number | null): string | null {
  if (source === null || source === '') return null;
  if (typeof source === 'number') {
    if (Platform.OS === 'web') return absolute(Asset.fromModule(source).uri);
    const resolved = Image.resolveAssetSource(source)?.uri ?? '';
    if (!resolved) return null;
    // A release build keeps bundled art as drawable resources under their minified names.
    return hasScheme(resolved) ? resolved : `file:///android_res/drawable/${resolved}.png`;
  }
  return Platform.OS === 'web' ? absolute(source) : source;
}

/**
 * The frame URLs of the given references, filled in as each resolves. A
 * reference that cannot be resolved stays out of the map, and the frame draws
 * nothing in its place.
 */
export function useComicImageUrls(refs: readonly string[]): ReadonlyMap<string, string> {
  const key = useMemo(() => [...new Set(refs)].sort().join('\n'), [refs]);
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const leasesRef = useRef(new Map<string, ResolvedAssetLease>());

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(key ? key.split('\n') : []);
    for (const [ref, lease] of leasesRef.current) {
      if (wanted.has(ref)) continue;
      lease.release();
      leasesRef.current.delete(ref);
    }
    setUrls((current) => {
      const kept = new Map([...current].filter(([ref]) => wanted.has(ref)));
      return kept.size === current.size ? current : kept;
    });
    for (const ref of wanted) {
      if (leasesRef.current.has(ref)) continue;
      void acquireResolvedAssetUri(ref).then((lease) => {
        if (cancelled || !wanted.has(ref) || leasesRef.current.has(ref)) {
          lease.release();
          return;
        }
        leasesRef.current.set(ref, lease);
        const url = comicFrameUrlFor(lease.source);
        if (url) setUrls((current) => new Map(current).set(ref, url));
      }, () => {});
    }
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => () => {
    for (const lease of leasesRef.current.values()) lease.release();
    leasesRef.current.clear();
  }, []);

  return urls;
}
