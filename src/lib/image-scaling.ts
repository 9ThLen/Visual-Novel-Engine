/**
 * Smaller copies of pictures, drawn in the browser: what the media grid's
 * thumbnails (thumbnails.ts) and the comic frame's display copies
 * (display-copies.ts) are made with.
 *
 * A copy costs one decode of the original at its full size — the expensive
 * part, in time and in memory — so decodes queue here, a couple at a time,
 * whichever of the two asked.
 *
 * Web-only by construction: it needs `createImageBitmap` and a canvas. Without
 * them `drawScaledImage` answers null, and callers use the original.
 */

export interface ScaledSize {
  width: number;
  height: number;
}

/** The size to draw a picture of this size at, or null when no copy is wanted. */
export type ScaledSizeFor = (width: number, height: number) => ScaledSize | null;

export interface ScaledImageFormat {
  type: string;
  quality: number;
}

/** Decodes are the expensive part, so only a couple run at a time. */
const MAX_CONCURRENT_DECODES = 2;

let active = 0;
const waiting: (() => void)[] = [];

export async function withImageDecodeSlot<T>(run: () => Promise<T>): Promise<T> {
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
 * The picture in `blob`, drawn at the size `sizeFor` gives it, or null: no
 * canvas here, or no copy wanted at that size.
 */
export async function drawScaledImage(
  blob: Blob,
  sizeFor: ScaledSizeFor,
  format: ScaledImageFormat,
): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;

  const bitmap = await createImageBitmap(blob);
  try {
    const size = sizeFor(bitmap.width, bitmap.height);
    if (!size || !size.width || !size.height) return null;
    // Already that size: a copy would only cost memory.
    if (size.width === bitmap.width && size.height === bitmap.height) return null;

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), format.type, format.quality);
    });
  } finally {
    bitmap.close();
  }
}

export function resetImageDecodeSlotsForTests(): void {
  active = 0;
  waiting.length = 0;
}
