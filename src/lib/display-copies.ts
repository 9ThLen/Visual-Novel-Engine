/**
 * Copies of large pictures at the size a document draws them, for a document
 * that decodes whatever it is given: the comic frame (comic-picture-size.ts
 * says why and how large).
 *
 * A copy is decoded from the original once, drawn into a canvas at its display
 * size, and kept as an object URL — a few hundred kilobytes of WebP in place of
 * a picture that decodes to tens of megabytes in the frame.
 *
 * Copies are leased like the resolver's object URLs (asset-resolver.ts): the
 * frame lets a far picture go and loads it again when the reader scrolls back,
 * so a copy it was given must stay loadable for as long as it shows the strip.
 * The cache evicts only copies nobody holds.
 *
 * Web-only, like the thumbnails: where there is no canvas, or the original
 * cannot be read back (a page opened from file:// cannot fetch its own
 * pictures, nor draw them into a canvas it may read), the lease holds no copy
 * and the caller gives the original.
 */
import {
  drawScaledImage,
  withImageDecodeSlot,
  type ScaledSizeFor,
} from '@/lib/image-scaling';

/** WebP keeps both the opaque backgrounds and the sprites' alpha small. */
const DISPLAY_COPY_FORMAT = { type: 'image/webp', quality: 0.9 };

/** Copies nobody holds that are kept for the next scene that needs them. */
const MAX_UNLEASED_COPIES = 64;
const TRANSIENT_FAILURE_TTL_MS = 30_000;

export interface DisplayCopyLease {
  /** The copy's object URL, or null: give the original. */
  uri: string | null;
  /** Idempotent. */
  release: () => void;
}

type DisplayCopyGenerator = (blob: Blob, sizeFor: ScaledSizeFor) => Promise<Blob | null>;

const drawDisplayCopy: DisplayCopyGenerator = (blob, sizeFor) => drawScaledImage(blob, sizeFor, DISPLAY_COPY_FORMAT);
let generate = drawDisplayCopy;

/** Test seam: jsdom has no canvas, so the drawing is substituted wholesale. */
export function setDisplayCopyGeneratorForTests(generator?: DisplayCopyGenerator): void {
  generate = generator ?? drawDisplayCopy;
}

/** Copy URLs by key, oldest first. */
const copies = new Map<string, string>();
const leases = new Map<string, number>();
const inFlight = new Map<string, Promise<string | null>>();
/** Originals that need no copy at this size: asking again would decode again. */
const refused = new Set<string>();
const retryAfter = new Map<string, number>();

function evictUnleased(): void {
  let unleased = [...copies.keys()].filter((key) => !leases.has(key));
  while (unleased.length > MAX_UNLEASED_COPIES) {
    const key = unleased.shift() as string;
    URL.revokeObjectURL(copies.get(key) as string);
    copies.delete(key);
  }
}

function makeCopy(key: string, sourceUri: string, sizeFor: ScaledSizeFor): Promise<string | null> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const work = withImageDecodeSlot(async () => {
    const response = await fetch(sourceUri);
    if (!response.ok) throw new Error(`Display copy fetch failed: ${response.status}`);
    const copy = await generate(await response.blob(), sizeFor);
    return copy ? URL.createObjectURL(copy) : null;
  })
    .then((objectUrl) => {
      if (objectUrl) {
        copies.set(key, objectUrl);
        evictUnleased();
      } else {
        // A decode that wants no smaller picture is permanent.
        refused.add(key);
      }
      return objectUrl;
    })
    .catch((error) => {
      // The original is given instead, which works but is the very thing a
      // copy exists to avoid: worth knowing in development.
      if (__DEV__) console.warn('[display-copies] no display copy for', sourceUri, error);
      retryAfter.set(key, Date.now() + TRANSIENT_FAILURE_TTL_MS);
      return null;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, work);
  return work;
}

/**
 * A copy of `sourceUri` at the size `sizeFor` gives it, held until released.
 *
 * `sourceUri` must already be loadable. `sizeKey` names the size rule, so one
 * original drawn two ways gets a copy for each. A lease with no copy means
 * every reason not to have one — no canvas, a picture already small enough, a
 * fetch that failed — and the caller shows the original either way.
 */
export async function acquireDisplayCopy(
  sourceUri: string,
  sizeKey: string,
  sizeFor: ScaledSizeFor,
): Promise<DisplayCopyLease> {
  const key = `${sizeKey}\n${sourceUri}`;
  const none: DisplayCopyLease = { uri: null, release: () => {} };
  if (!sourceUri || refused.has(key)) return none;
  const retryAt = retryAfter.get(key);
  if (retryAt && retryAt > Date.now()) return none;
  retryAfter.delete(key);

  // Held from the moment it is asked for, so a copy made meanwhile is not evicted before it is handed over.
  leases.set(key, (leases.get(key) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const remaining = (leases.get(key) ?? 1) - 1;
    if (remaining > 0) {
      leases.set(key, remaining);
      return;
    }
    leases.delete(key);
    // Shown until now: the last of the unheld to go.
    const uri = copies.get(key);
    if (uri) {
      copies.delete(key);
      copies.set(key, uri);
    }
    evictUnleased();
  };

  const cached = copies.get(key);
  if (cached) {
    // Most recently wanted last, so the oldest is evicted first.
    copies.delete(key);
    copies.set(key, cached);
    return { uri: cached, release };
  }
  const uri = await makeCopy(key, sourceUri, sizeFor);
  if (!uri) {
    release();
    return none;
  }
  return { uri, release };
}

export function resetDisplayCopiesForTests(): void {
  for (const url of copies.values()) URL.revokeObjectURL(url);
  copies.clear();
  leases.clear();
  inFlight.clear();
  refused.clear();
  retryAfter.clear();
  generate = drawDisplayCopy;
}
