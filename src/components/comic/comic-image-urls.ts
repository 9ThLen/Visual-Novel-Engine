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
 *    The bare name comes as a module's resolved source or as the string the
 *    asset resolver hands back for a bundled picture; left bare, the frame
 *    reads it against its own page and finds nothing.
 *
 * And not the original picture when it is much larger than the frame draws it
 * (comic-picture-size.ts): on the web and the desktop the host makes a display
 * copy of it once and gives the frame that (display-copies.ts); a native
 * release carries copies made when it was staged. Where no copy can be had —
 * a page opened from file://, a release staged before copies, the media
 * library on a phone — the frame gets the original, as it always did.
 */
import { Asset } from 'expo-asset';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform } from 'react-native';

import { acquireResolvedAssetUri, getPackagedDisplayCopyUri } from '@/lib/asset-resolver';
import type { ComicPlanPicture } from '@/lib/comic/comic-frame-strip';
import { comicDisplaySize, type ComicPictureRole } from '@/lib/comic/comic-picture-size';
import { acquireDisplayCopy } from '@/lib/display-copies';

function hasScheme(uri: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(uri);
}

/** A bundled picture's drawable resource, as WebView reads it out of the APK. */
function androidDrawableUrl(name: string): string {
  return `file:///android_res/drawable/${name}.png`;
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
    return hasScheme(resolved) ? resolved : androidDrawableUrl(resolved);
  }
  if (Platform.OS === 'web') return absolute(source);
  return hasScheme(source) ? source : androidDrawableUrl(source);
}

interface HeldPicture {
  url: string | null;
  release: () => void;
}

/**
 * The URL the frame is given for one picture, and what to let go when it no
 * longer shows it: a display copy where one can be had, else the original.
 */
export async function acquireComicPicture(ref: string, roles: readonly ComicPictureRole[]): Promise<HeldPicture> {
  if (Platform.OS !== 'web') {
    const packaged = getPackagedDisplayCopyUri(ref);
    if (packaged) return { url: comicFrameUrlFor(packaged), release: () => {} };
  }
  const lease = await acquireResolvedAssetUri(ref);
  const url = comicFrameUrlFor(lease.source);
  if (!url || Platform.OS !== 'web') return { url, release: lease.release };

  const copy = await acquireDisplayCopy(url, roles.join('+'), (width, height) => comicDisplaySize(roles, width, height));
  if (!copy.uri) return { url, release: lease.release };
  // The original stays leased too: the copy is cached by its URL.
  return {
    url: copy.uri,
    release: () => {
      copy.release();
      lease.release();
    },
  };
}

function pictureKey(ref: string, roles: readonly ComicPictureRole[]): string {
  return `${roles.join('+')}\t${ref}`;
}

/**
 * The frame URLs of the given pictures by reference, filled in as each
 * resolves. A reference that cannot be resolved stays out of the map, and the
 * frame draws nothing in its place.
 */
export function useComicImageUrls(pictures: readonly ComicPlanPicture[]): ReadonlyMap<string, string> {
  const key = useMemo(
    () => [...new Set(pictures.map((picture) => pictureKey(picture.ref, picture.roles)))].sort().join('\n'),
    [pictures],
  );
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const heldRef = useRef(new Map<string, HeldPicture>());

  useEffect(() => {
    let cancelled = false;
    const wanted = new Map<string, { ref: string; roles: ComicPictureRole[] }>();
    for (const line of key ? key.split('\n') : []) {
      const [roles, ref] = line.split('\t');
      wanted.set(line, { ref, roles: roles.split('+') as ComicPictureRole[] });
    }
    for (const [held, picture] of heldRef.current) {
      if (wanted.has(held)) continue;
      picture.release();
      heldRef.current.delete(held);
    }
    const wantedRefs = new Set([...wanted.values()].map((picture) => picture.ref));
    setUrls((current) => {
      const kept = new Map([...current].filter(([ref]) => wantedRefs.has(ref)));
      return kept.size === current.size ? current : kept;
    });
    for (const [line, { ref, roles }] of wanted) {
      if (heldRef.current.has(line)) continue;
      void acquireComicPicture(ref, roles).then((picture) => {
        if (cancelled || heldRef.current.has(line)) {
          picture.release();
          return;
        }
        heldRef.current.set(line, picture);
        const { url } = picture;
        if (url) setUrls((current) => (current.get(ref) === url ? current : new Map(current).set(ref, url)));
      }, () => {});
    }
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => () => {
    for (const picture of heldRef.current.values()) picture.release();
    heldRef.current.clear();
  }, []);

  return urls;
}
