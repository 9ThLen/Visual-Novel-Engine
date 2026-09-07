/**
 * A still frame to stand in for a clip in the grid.
 *
 * A video tile had nothing to show: the asset carries no poster, and handing an
 * .mp4 to `<Image>` renders an empty square, so every clip in the library
 * looked alike — and, worse, looked like an image that had failed to load.
 *
 * On the web the frame is grabbed the same way `pick-video` reads a duration:
 * a detached `<video>` element, seeked a little past the start, drawn once into
 * a canvas. On a phone the player does it — `expo-video` can hand back a frame
 * at a given time without anything being on screen, which is the same answer
 * from the platform that is already decoding the story's clips.
 *
 * Seeking past zero on purpose, on both: the first frame of a fade-in is black,
 * which is a poster that says nothing.
 *
 * What comes back differs by platform and callers must not care: the web has an
 * object URL, a phone has a native image reference. Both go straight into
 * `expo-image`, which is why this returns a source rather than a URI.
 */

import { Platform } from 'react-native';
import type { SharedRefType } from 'expo';

/** Long side in CSS pixels: 2× the widest tile the grid lays out. */
const POSTER_MAX_SIDE = 320;
/** Far enough in to clear a fade from black, short enough to be the same shot. */
const POSTER_SECONDS = 0.25;
/** A clip that cannot be decoded must not hold the screen. */
const POSTER_TIMEOUT_MS = 4000;
const MAX_CACHED_POSTERS = 64;
/** Decoding video frames is the expensive part; only one runs at a time. */
const MAX_CONCURRENT = 1;

/** An object URL on the web, a native image reference on a phone. */
export type PosterSource = string | SharedRefType<'image'>;

type PosterGrabber = (loadableUri: string) => Promise<PosterSource | null>;

const cache = new Map<string, PosterSource>();
const inFlight = new Map<string, Promise<PosterSource | null>>();
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

/** The browser's answer: a canvas frame, kept alive as an object URL. */
function grabFrameOnWeb(loadableUri: string): Promise<PosterSource | null> {
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
      resolve(blob ? URL.createObjectURL(blob) : null);
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

/**
 * The phone's answer: the same player that would show the clip, asked for one
 * frame and then let go. Imported at the call rather than at the top, the way
 * the pickers reach for their native modules — nothing here should load a
 * player on a platform that will never build one.
 */
async function grabFrameOnNative(loadableUri: string): Promise<PosterSource | null> {
  const { createVideoPlayer } = await import('expo-video');
  const player = createVideoPlayer(loadableUri);
  try {
    // A clip shorter than the offset still has a frame at its own start; the
    // player clamps rather than refusing, and reports the time it really used.
    const [thumbnail] = await player.generateThumbnailsAsync(POSTER_SECONDS, {
      maxWidth: POSTER_MAX_SIDE,
      maxHeight: POSTER_MAX_SIDE,
    });
    return thumbnail ?? null;
  } finally {
    // A player per clip is the expensive part of this; it is held exactly as
    // long as the one frame takes.
    player.release();
  }
}

function grabFrame(loadableUri: string): Promise<PosterSource | null> {
  return Platform.OS === 'web' ? grabFrameOnWeb(loadableUri) : grabFrameOnNative(loadableUri);
}

let grab: PosterGrabber = grabFrame;

/**
 * Test seam: jsdom decodes no video and there is no player to ask, so the grab
 * is substituted wholesale.
 */
export function setPosterGrabberForTests(grabber?: PosterGrabber): void {
  grab = grabber ?? grabFrame;
}

/** Only the web's posters are object URLs, and only those must be revoked. */
function releasePoster(poster: PosterSource): void {
  if (typeof poster === 'string') URL.revokeObjectURL(poster);
  else poster.release?.();
}

function remember(source: string, poster: PosterSource): void {
  cache.set(source, poster);
  while (cache.size > MAX_CACHED_POSTERS) {
    const [oldest, evicted] = cache.entries().next().value as [string, PosterSource];
    cache.delete(oldest);
    releasePoster(evicted);
  }
}

/**
 * A source `expo-image` can draw for a still from `loadableUri`, or null to
 * show the glyph.
 *
 * `loadableUri` must already be loadable — resolve asset ids and `idb://`
 * handles before calling. Null covers every reason there is no poster: no
 * canvas, no player, a clip that would not decode, a frame the platform would
 * not hand over. Callers treat them all the same way.
 */
export async function getVideoPosterSource(loadableUri: string): Promise<PosterSource | null> {
  if (!loadableUri || refused.has(loadableUri)) return null;

  const cached = cache.get(loadableUri);
  if (cached) return cached;

  const pending = inFlight.get(loadableUri);
  if (pending) return pending;

  const work = withSlot(() => grab(loadableUri))
    .then((poster) => {
      if (!poster) {
        refused.add(loadableUri);
        return null;
      }
      remember(loadableUri, poster);
      return poster;
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
  for (const poster of cache.values()) releasePoster(poster);
  cache.clear();
  inFlight.clear();
  refused.clear();
  active = 0;
  waiting.length = 0;
}
