/**
 * How large a picture the comic frame is given (COMIC-RENDERER-SPIKE.md,
 * condition 1 of "Без цих умов").
 *
 * A WebView decodes a picture at its full size whatever the size it is drawn
 * at: a 2508×1672 background is ≈ 16.8 MB of pixels in a panel a phone draws
 * about 1080 pixels wide. With originals the spike saw the renderer killed on a
 * 2 GB Android and 40 % of frames dropped in WebView2; copies the size of the
 * screen removed both. So the frame gets a copy no larger than these, made by
 * the host on the web and the desktop, and when a release is staged for
 * Android.
 *
 * The sizes follow the frame document (comic-frame-document.ts): a panel is
 * 16:10 and at most 730 CSS pixels wide, a background covers it, a sprite is
 * 80 % of its height, and a shot zooms the stage up to 2.8×. A phone's panel
 * is about 1080 device pixels wide and a medium shot (1.45×) of it shows a
 * background at about 1570; closer shots are drawn from fewer pixels, which a
 * comic's art bears well. Sprites get half as much again, because the close
 * shots are of them.
 *
 * Plain TypeScript, no React and no platform: the staging tool uses it too.
 */

/** What a picture is in a panel: the stage behind, or a figure standing on it. */
export type ComicPictureRole = 'background' | 'sprite';

/** A background is made just large enough to cover a panel this size. */
export const COMIC_BACKGROUND_BOX = { width: 1600, height: 1000 } as const;

/** A sprite is drawn by its height; it is made no taller than this. */
export const COMIC_SPRITE_MAX_HEIGHT = 1200;

export interface PictureSize {
  width: number;
  height: number;
}

/**
 * A copy must be at least this much smaller to be made. One a few percent
 * smaller saves next to no memory, and costs a decode and a lossy encode.
 */
const WORTHWHILE_SCALE = 0.9;

function scaleFor(role: ComicPictureRole, width: number, height: number): number {
  // Cover, as the frame draws a background: the smaller scale that still fills both sides.
  if (role === 'background') return Math.max(COMIC_BACKGROUND_BOX.width / width, COMIC_BACKGROUND_BOX.height / height);
  return COMIC_SPRITE_MAX_HEIGHT / height;
}

/**
 * The size of the copy to give the frame, or null when the original will do:
 * it is no larger than that, or hardly, or has no size to scale. A picture
 * used more than one way is made for the one that needs it largest.
 */
export function comicDisplaySize(
  roles: ComicPictureRole | readonly ComicPictureRole[],
  width: number,
  height: number,
): PictureSize | null {
  if (!(width > 0) || !(height > 0)) return null;
  const list: readonly ComicPictureRole[] = typeof roles === 'string' ? [roles] : roles;
  if (!list.length) return null;
  const scale = Math.max(...list.map((role) => scaleFor(role, width, height)));
  if (scale > WORTHWHILE_SCALE) return null;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
