import type { ActivePathResult } from '@/lib/document-editor/story-path';

/**
 * Branch accent colors for the document editor.
 *
 * Every option of a choice block gets a stable color by its position in the
 * options list, so the same branch keeps the same tint across re-renders,
 * branch switches, and sessions. Scenes inherit the color of the choice edge
 * they were reached through on the active path (`viaChoice` metadata); merge
 * points and pre-choice scenes stay neutral.
 *
 * Keep BRANCH_COLOR_PALETTE in sync with the branchPalette array in
 * lib/vn-plate-editor/embedded-script.ts — the webview tints its branch
 * switcher tabs with the same colors by option index.
 */
export const BRANCH_COLOR_PALETTE = [
  '#d97706', // amber
  '#67683F', // sage
  '#7c3aed', // violet
  '#0d9488', // teal
  '#db2777', // pink
  '#65a30d', // olive green
] as const;

/** Stable color for a choice option by its position in the options list. */
export function branchColorForOptionIndex(optionIndex: number): string {
  const index = optionIndex >= 0 ? optionIndex % BRANCH_COLOR_PALETTE.length : 0;
  return BRANCH_COLOR_PALETTE[index];
}

/**
 * Translucent rgba() form of a branch hex color, used for the tinted card
 * shadows in the choice block. Mirrored as `branchShadow` in
 * lib/vn-plate-editor/embedded-script.ts — keep in sync.
 */
export function branchShadowColor(hexColor: string, alpha: number): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function channel(hexColor: string, offset: number): number {
  return parseInt(hexColor.slice(offset, offset + 2), 16);
}

/** Linear RGB mix of two hex colors; `weight` is the share of `b` (0..1). */
export function mixHexColors(a: string, b: string, weight: number): string {
  const t = Math.min(1, Math.max(0, weight));
  const mix = (offset: number) =>
    Math.round(channel(a, offset) + (channel(b, offset) - channel(a, offset)) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/**
 * Softened, low-key version of a branch color for the ambient page tint
 * (shadows, stripes, sidebar dots) — the full-strength palette colors are
 * reserved for small identification UI like choice-card dots.
 */
export function pastelBranchColor(hexColor: string): string {
  return mixHexColors(hexColor, '#ffffff', 0.45);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = channel(hex, 1) / 255;
  const g = channel(hex, 3) / 255;
  const b = channel(hex, 5) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Hue-aware blend of two branch colors; `weight` is the share of `b` (0..1).
 * Interpolates the hue along the shortest arc and keeps saturation, so mixes
 * of distant hues (e.g. amber + blue) land on a vivid intermediate color
 * instead of the muddy gray an RGB average would produce.
 */
export function mixBranchColors(a: string, b: string, weight: number): string {
  const t = Math.min(1, Math.max(0, weight));
  const ha = hexToHsl(a);
  const hb = hexToHsl(b);
  let dh = hb.h - ha.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  let h = (ha.h + dh * t) % 360;
  if (h < 0) h += 360;
  const s = ha.s + (hb.s - ha.s) * t;
  const l = ha.l + (hb.l - ha.l) * t;
  return hslToHex(h, s, l);
}

/**
 * Maps each active-path scene to the ambient tint of the branch it belongs
 * to. Scenes without `viaChoice` metadata (before the first choice, or merge
 * points shared by several branches) get no entry.
 *
 * Nested branches blend: a scene inside branch B of a choice that itself sits
 * inside branch A gets a hue-aware mix of both colors (nearest branch
 * dominates at 75%), so the tint shifts gradually while story lines with
 * different colors have not merged yet. The result is pastelized — ambient
 * tints must stay unobtrusive.
 */
export function computeBranchColorBySceneId(activePath: ActivePathResult): Record<string, string> {
  const colors: Record<string, string> = {};

  for (const [sceneId, metadata] of Object.entries(activePath.metadataBySceneId)) {
    const trail = metadata.viaChoiceTrail?.length
      ? metadata.viaChoiceTrail
      : metadata.viaChoice
        ? [metadata.viaChoice]
        : [];
    if (!trail.length) continue;

    let blended: string | undefined;
    for (const viaChoice of trail) {
      const branchInfo = activePath.branchInfoByChoiceStepId[viaChoice.choiceStepId];
      if (!branchInfo) continue;
      const optionIndex = branchInfo.options.findIndex((option) => option.optionId === viaChoice.optionId);
      if (optionIndex < 0) continue;
      const color = branchColorForOptionIndex(optionIndex);
      blended = blended ? mixBranchColors(blended, color, 0.75) : color;
    }
    if (!blended) continue;

    colors[sceneId] = pastelBranchColor(blended);
  }

  return colors;
}
