/**
 * Small stand-ins for large images, for grids that show many at once.
 *
 * The media library renders every tile from the original file. The bundled
 * backgrounds are 6–9 MB PNGs, and a PNG's cost on screen is not its file size
 * but its decoded bitmap: a 4000×2250 image occupies ~36 MB of RGBA no matter
 * how small the tile is. Six tiles is a fifth of a gigabyte, which is where a
 * phone gives up first.
 *
 * A thumbnail is decoded once, drawn into a canvas at tile size, and kept as a
 * ~30 KB object URL. The full file is still what the inspector and the reader
 * load; this is only for the grid.
 *
 * Web-only by construction — it needs a canvas. Everywhere else `getThumbnailUri`
 * returns null and callers fall back to the original, which is exactly the
 * behaviour they had before this module existed.
 */

/** Long side in CSS pixels: 2× the widest tile the grid lays out. */
export const THUMBNAIL_MAX_SIDE = 320;

/** Decodes are the expensive part, so only a couple run at a time. */
const MAX_CONCURRENT_DECODES = 2;

/**
 * Object URLs are small; the originals they stand in for are not. Keeping a few
 * hundred costs a few megabytes and saves re-decoding on every scroll back.
 */
const MAX_CACHED_THUMBNAILS = 256;

type ThumbnailGenerator = (blob: Blob, maxSide: number) => Promise<Blob | null>;

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();
/** Sources that cannot produce a thumbnail: asking again would decode again. */
const refused = new Set<string>();

let active = 0;
const waiting: (() => void)[] = [];

async function withDecodeSlot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_DECODES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  try {
    return await run();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

/**
 * Fit inside a square of `maxSide` without upscaling.
 *
 * Kept separate from the drawing so the arithmetic is testable where no canvas
 * exists, which is everywhere the tests run.
 */
export function thumbnailDimensions(
  width: number,
  height: number,
  maxSide = THUMBNAIL_MAX_SIDE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

async function drawThumbnail(blob: Blob, maxSide: number): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;

  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = thumbnailDimensions(bitmap.width, bitmap.height, maxSide);
    if (!width || !height) return null;
    // Already small enough that a copy would only cost memory.
    if (width === bitmap.width && height === bitmap.height) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/webp', 0.82);
    });
  } finally {
    bitmap.close();
  }
}

let generate: ThumbnailGenerator = drawThumbnail;

/** Test seam: jsdom has no canvas, so the drawing is substituted wholesale. */
export function setThumbnailGeneratorForTests(generator?: ThumbnailGenerator): void {
  generate = generator ?? drawThumbnail;
}

function remember(source: string, objectUrl: string): void {
  cache.set(source, objectUrl);
  while (cache.size > MAX_CACHED_THUMBNAILS) {
    const [oldest, url] = cache.entries().next().value as [string, string];
    cache.delete(oldest);
    URL.revokeObjectURL(url);
  }
}

/**
 * A loadable URI for a small version of `sourceUri`, or null to use the original.
 *
 * `sourceUri` must already be loadable — resolve asset ids and `idb://` handles
 * before calling. Null covers every reason a thumbnail is not available: no
 * canvas, an image already small enough, a fetch that failed. Callers treat all
 * of them the same way, by showing what they would have shown anyway.
 */
export async function getThumbnailUri(
  sourceUri: string,
  maxSide = THUMBNAIL_MAX_SIDE,
): Promise<string | null> {
  if (!sourceUri || refused.has(sourceUri)) return null;

  const cached = cache.get(sourceUri);
  if (cached) return cached;

  const pending = inFlight.get(sourceUri);
  if (pending) return pending;

  const work = withDecodeSlot(async () => {
    const response = await fetch(sourceUri);
    if (!response.ok) return null;
    const thumbnail = await generate(await response.blob(), maxSide);
    if (!thumbnail) return null;
    return URL.createObjectURL(thumbnail);
  })
    .then((objectUrl) => {
      if (objectUrl) remember(sourceUri, objectUrl);
      else refused.add(sourceUri);
      return objectUrl;
    })
    .catch(() => {
      refused.add(sourceUri);
      return null;
    })
    .finally(() => {
      inFlight.delete(sourceUri);
    });

  inFlight.set(sourceUri, work);
  return work;
}

export function resetThumbnailsForTests(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  inFlight.clear();
  refused.clear();
  active = 0;
  waiting.length = 0;
  generate = drawThumbnail;
}
