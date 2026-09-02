/**
 * A still frame to stand in for a clip in the grid.
 *
 * A video tile had nothing to show: the asset carries no poster, and handing an
 * .mp4 to `<Image>` renders an empty square, so every clip in the library
 * looked alike — and, worse, looked like an image that had failed to load.
 *
 * The frame is grabbed the same way `pick-video` reads a duration: a detached
 * `<video>` element, seeked a little past the start, drawn once into a canvas.
 * Seeking past zero on purpose — the first frame of a fade-in is black, which
 * is a poster that says nothing.
 *
 * Web-only by construction, like `thumbnails`: everywhere else this returns
 * null and the tile shows the glyph it showed before.
 */

/** Long side in CSS pixels: 2× the widest tile the grid lays out. */
const POSTER_MAX_SIDE = 320;
/** Far enough in to clear a fade from black, short enough to be the same shot. */
const POSTER_SECONDS = 0.25;
/** A clip that cannot be decoded must not hold the screen. */
const POSTER_TIMEOUT_MS = 4000;
const MAX_CACHED_POSTERS = 64;
/** Decoding video frames is the expensive part; only one runs at a time. */
const MAX_CONCURRENT = 1;

type PosterGrabber = (loadableUri: string) => Promise<Blob | null>;

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();
/** Sources that produced no frame: asking again would decode again. */
const refused = new Set<string>();

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
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
 * Separate from the drawing so the arithmetic is testable where no canvas
 * exists, which is everywhere the tests run.
 */
export function posterDimensions(
  width: number,
  height: number,
  maxSide = POSTER_MAX_SIDE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function grabFrame(loadableUri: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const video = document.createElement('video');
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load?.();
      resolve(blob);
    };

    const timer = setTimeout(() => finish(null), POSTER_TIMEOUT_MS);

    video.preload = 'metadata';
    video.muted = true;
    // Some browsers refuse to decode frames from a video that never played
    // inline; this is the same hint a player gives, without a player.
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
      // A clip shorter than the offset still has a frame at its own start.
      const target = Number.isFinite(video.duration) && video.duration > POSTER_SECONDS
        ? POSTER_SECONDS
        : 0;
      try {
        video.currentTime = target;
      } catch {
        finish(null);
      }
    };

    video.onseeked = () => {
      try {
        const { width, height } = posterDimensions(video.videoWidth, video.videoHeight);
        if (!width || !height) {
          finish(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          finish(null);
          return;
        }
        context.drawImage(video, 0, 0, width, height);
        canvas.toBlob((blob) => finish(blob), 'image/webp', 0.8);
      } catch {
        // A cross-origin frame taints the canvas; that is a refusal, not a crash.
        finish(null);
      }
    };

    video.onerror = () => finish(null);
    video.src = loadableUri;
  });
}

let grab: PosterGrabber = grabFrame;

/** Test seam: jsdom decodes no video, so the grab is substituted wholesale. */
export function setPosterGrabberForTests(grabber?: PosterGrabber): void {
  grab = grabber ?? grabFrame;
}

function remember(source: string, objectUrl: string): void {
  cache.set(source, objectUrl);
  while (cache.size > MAX_CACHED_POSTERS) {
    const [oldest, url] = cache.entries().next().value as [string, string];
    cache.delete(oldest);
    URL.revokeObjectURL(url);
  }
}

/**
 * A loadable URI for a still from `loadableUri`, or null to show the glyph.
 *
 * `loadableUri` must already be loadable — resolve asset ids and `idb://`
 * handles before calling. Null covers every reason there is no poster: no
 * canvas, a clip that would not decode, a frame the browser would not hand
 * over. Callers treat them all the same way.
 */
export async function getVideoPosterUri(loadableUri: string): Promise<string | null> {
  if (!loadableUri || refused.has(loadableUri)) return null;

  const cached = cache.get(loadableUri);
  if (cached) return cached;

  const pending = inFlight.get(loadableUri);
  if (pending) return pending;

  const work = withSlot(() => grab(loadableUri))
    .then((blob) => {
      if (!blob) {
        refused.add(loadableUri);
        return null;
      }
      const objectUrl = URL.createObjectURL(blob);
      remember(loadableUri, objectUrl);
      return objectUrl;
    })
    .catch((error) => {
      if (__DEV__) console.warn('[video-poster] no poster for', loadableUri, error);
      refused.add(loadableUri);
      return null;
    })
    .finally(() => {
      inFlight.delete(loadableUri);
    });

  inFlight.set(loadableUri, work);
  return work;
}

export function resetVideoPostersForTests(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  inFlight.clear();
  refused.clear();
  active = 0;
  waiting.length = 0;
}
