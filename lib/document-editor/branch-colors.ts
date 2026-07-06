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
  '#2563eb', // blue
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
 * Maps each active-path scene to the accent color of the branch it belongs
 * to. Scenes without `viaChoice` metadata (before the first choice, or merge
 * points shared by several branches) get no entry.
 */
export function computeBranchColorBySceneId(activePath: ActivePathResult): Record<string, string> {
  const colors: Record<string, string> = {};

  for (const [sceneId, metadata] of Object.entries(activePath.metadataBySceneId)) {
    const viaChoice = metadata.viaChoice;
    if (!viaChoice) continue;

    const branchInfo = activePath.branchInfoByChoiceStepId[viaChoice.choiceStepId];
    if (!branchInfo) continue;

    const optionIndex = branchInfo.options.findIndex((option) => option.optionId === viaChoice.optionId);
    if (optionIndex < 0) continue;

    colors[sceneId] = branchColorForOptionIndex(optionIndex);
  }

  return colors;
}
