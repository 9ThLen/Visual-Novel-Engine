/**
 * The stage: the part of the display a character may stand in.
 *
 * The dialogue panel keeps a band of the screen for itself, and characters are
 * scaled and placed inside what is left. The band has to match where the panel
 * is actually drawn — `getReaderLayout()` reports `'right'` in landscape, but
 * no reader preset renders a side panel, so following that report left the
 * landscape stage unreserved and the panel covered the character's legs.
 *
 * The reserve is deliberately fixed rather than measured from the live panel: a
 * character that resized between a one-line and a four-line reply would be far
 * more distracting than a panel that occasionally overlaps a long reply.
 */

import type { StoryReaderLayoutPreset } from '@/lib/story-theme';

/** Space under the panel, so it does not sit on the edge of the display. */
export const DIALOGUE_MARGIN_BOTTOM = 28;
export const DENSE_DIALOGUE_MARGIN_BOTTOM = 12;
/** Padding inside the panel around the dialogue text. */
export const DIALOGUE_PANEL_PADDING = 16;
export const DENSE_DIALOGUE_PANEL_PADDING = 12;
/** The speaker's name plate keeps its row whether or not there is a speaker. */
export const SPEAKER_ROW_MIN_HEIGHT = 28;
/** Lines the text box holds open, so short replies do not shrink the panel. */
export const DIALOGUE_MIN_LINES = 3;
export const CONTROLS_ROW_PADDING_TOP = 4;
export const CONTROLS_ROW_PADDING_BOTTOM = 12;
export const DENSE_CONTROLS_ROW_PADDING_BOTTOM = 8;
/** One row of reader controls: a 12px label, 6px of padding, a 1px border. */
const CONTROL_ROW_HEIGHT = 32;
const CONTROLS_ROW_GAP = 8;
/** Narrower than this, the auto/log and back/skip groups wrap onto two rows. */
const CONTROLS_WRAP_WIDTH = 480;
/**
 * A landscape phone is barely taller than the panel itself. Past this share of
 * the stage the reserve stops growing and the panel is allowed to overlap
 * instead — a character with nowhere to stand is worse than covered feet.
 */
export const MAX_DIALOGUE_RESERVE_FRACTION = 0.4;
/** Where the `top` preset pins the panel. */
export const READER_TOP_PRESET_OFFSET = 72;

export interface ReaderStageInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_STAGE_INSETS: ReaderStageInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function isDenseReaderLayout(layoutPreset: StoryReaderLayoutPreset): boolean {
  return layoutPreset !== 'classic';
}

/**
 * Height the dialogue panel holds open: its name plate, three lines of text,
 * the controls row under it, and the margin below the whole block.
 */
export function readerDialogueReservedHeight({
  lineHeight,
  panelWidth,
  dense = false,
}: {
  lineHeight: number;
  panelWidth: number;
  dense?: boolean;
}): number {
  const padding = dense ? DENSE_DIALOGUE_PANEL_PADDING : DIALOGUE_PANEL_PADDING;
  const controlRows = panelWidth < CONTROLS_WRAP_WIDTH ? 2 : 1;
  const controlsRow = CONTROLS_ROW_PADDING_TOP
    + (dense ? DENSE_CONTROLS_ROW_PADDING_BOTTOM : CONTROLS_ROW_PADDING_BOTTOM)
    + CONTROL_ROW_HEIGHT * controlRows
    + CONTROLS_ROW_GAP * (controlRows - 1);

  return SPEAKER_ROW_MIN_HEIGHT
    + lineHeight * DIALOGUE_MIN_LINES + padding * 2
    + controlsRow
    + (dense ? DENSE_DIALOGUE_MARGIN_BOTTOM : DIALOGUE_MARGIN_BOTTOM);
}

/**
 * What the stage loses to the dialogue panel, on the side the panel is drawn.
 *
 * The box has all four sides so a layout that puts the panel beside the
 * characters can take width instead of height; today's presets place it at the
 * bottom, or at the top for the `top` preset.
 */
export function readerStageInsets({
  stageWidth,
  stageHeight,
  layoutPreset,
  lineHeight,
  panelWidth,
}: {
  stageWidth: number;
  stageHeight: number;
  layoutPreset: StoryReaderLayoutPreset;
  lineHeight: number;
  panelWidth?: number;
}): ReaderStageInsets {
  const dense = isDenseReaderLayout(layoutPreset);
  const reserved = readerDialogueReservedHeight({
    lineHeight,
    panelWidth: panelWidth ?? stageWidth,
    dense,
  });
  const capped = Math.min(reserved, Math.max(0, stageHeight) * MAX_DIALOGUE_RESERVE_FRACTION);

  return layoutPreset === 'top'
    ? { ...NO_STAGE_INSETS, top: READER_TOP_PRESET_OFFSET + capped }
    : { ...NO_STAGE_INSETS, bottom: capped };
}
