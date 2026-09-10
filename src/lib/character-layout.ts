/**
 * How large a character sprite is drawn.
 *
 * Sprites are scaled by the height of the stage they stand on — the display
 * minus the dialogue panel — rather than by the width of the window. Width
 * scaling made a full-body character tiny exactly where the height is there to
 * be used: on a phone, a 35%-of-width sprite in a 9:16 box covers less than a
 * third of the screen. Height scaling keeps the composition constant across
 * resolutions of the same aspect ratio: 720p, 1080p and 1440p differ in pixels,
 * not in how much of the stage the character fills.
 *
 * Every surface that draws a character — the reader, the editor preview, the
 * inspector's device preview — sizes sprites through this module, so the same
 * sprite is the same size in all three.
 */

/** Share of the available stage height a character fills; leaves headroom. */
export const CHARACTER_STAGE_HEIGHT_FRACTION = 0.92;

/** Used until a sprite reports its own size; a typical full-body pose. */
export const DEFAULT_CHARACTER_ASPECT_RATIO = 9 / 16;

/**
 * A full-height sprite can still be too wide for the stage — a square portrait
 * at 92% of a phone's height would be wider than the phone. The cap also keeps
 * a crowded scene readable: the more characters share the stage, the less width
 * each one may claim before they cover each other.
 *
 * A lone character is allowed nearly the whole width. It has to be: a 2:3 sprite
 * at 92% of a phone's height is 93% as wide as the phone, and a tighter cap
 * would take the height back off it for width the scene is not using.
 */
export function characterMaxWidthFraction(characterCount: number): number {
  if (characterCount >= 3) return 0.42;
  if (characterCount === 2) return 0.55;
  return 0.95;
}

export interface CharacterSpriteSizeInput {
  /** Width of the stage the sprite stands on. */
  stageWidth: number;
  /** Height of the stage, with the dialogue panel already subtracted. */
  stageHeight: number;
  /** Width / height of the sprite file. Falls back to a full-body default. */
  aspectRatio?: number;
  /** Characters sharing the stage, which decides the width cap. */
  characterCount?: number;
  heightFraction?: number;
}

/**
 * Box a sprite is drawn into: as tall as `heightFraction` of the stage allows,
 * in the sprite's own proportions, narrowed to fit the width when needed.
 */
export function getCharacterSpriteSize({
  stageWidth,
  stageHeight,
  aspectRatio,
  characterCount = 1,
  heightFraction = CHARACTER_STAGE_HEIGHT_FRACTION,
}: CharacterSpriteSizeInput): { width: number; height: number } {
  if (!(stageWidth > 0) || !(stageHeight > 0)) return { width: 0, height: 0 };

  const ratio = Number.isFinite(aspectRatio) && (aspectRatio ?? 0) > 0
    ? (aspectRatio as number)
    : DEFAULT_CHARACTER_ASPECT_RATIO;

  const height = stageHeight * heightFraction;
  const width = height * ratio;
  const maxWidth = stageWidth * characterMaxWidthFraction(characterCount);

  return width <= maxWidth ? { width, height } : { width: maxWidth, height: maxWidth / ratio };
}
