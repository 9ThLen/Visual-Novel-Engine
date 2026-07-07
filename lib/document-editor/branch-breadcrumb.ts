import { branchColorForOptionIndex } from '@/lib/document-editor/branch-colors';
import type { ActivePathResult } from '@/lib/document-editor/story-path';

/**
 * Breadcrumb model for the document editor: the chain of choices the author
 * navigated through to reach a scene on the active path.
 *
 * Derived from the path walk itself (`branchInfoByChoiceStepId` +
 * `activeScenes` order), NOT from `viaChoiceTrail` — the trail is cleared at
 * merge points, which is right for branch tinting but wrong for the reader's
 * history: a choice made before a merge is still part of how the author got
 * here.
 */
export interface BranchBreadcrumbItem {
  choiceStepId: string;
  /** Scene the choice block lives in. */
  sceneId: string;
  /** Index of that scene on the active path (activeScenes order). */
  sceneIndex: number;
  optionId: string;
  optionIndex: number;
  /** Raw option text; may be empty — the UI decides the fallback label. */
  label: string;
  /** Same accent color the choice card uses for this option. */
  color: string;
}

/**
 * Choice crumbs for the whole active path, in path order. A crumb applies to
 * scenes AFTER its choice scene: to build the breadcrumb of a scene at index
 * `i`, keep crumbs with `sceneIndex < i` (see crumbsForSceneIndex).
 */
export function buildBranchBreadcrumbTrail(activePath: ActivePathResult): BranchBreadcrumbItem[] {
  const infoBySceneId = new Map(
    Object.values(activePath.branchInfoByChoiceStepId).map((info) => [info.sceneId, info]),
  );
  const trail: BranchBreadcrumbItem[] = [];
  activePath.activeScenes.forEach((scene, sceneIndex) => {
    const info = infoBySceneId.get(scene.id);
    if (!info) return;
    const optionIndex = info.options.findIndex((option) => option.optionId === info.selectedOptionId);
    if (optionIndex < 0) return;
    trail.push({
      choiceStepId: info.choiceStepId,
      sceneId: scene.id,
      sceneIndex,
      optionId: info.selectedOptionId,
      optionIndex,
      label: info.options[optionIndex].text,
      color: branchColorForOptionIndex(optionIndex),
    });
  });
  return trail;
}

/**
 * Crumbs for the choices that lead INTO the scene at `sceneIndex` on the
 * active path — the choice sits at the end of its scene, so the scene's own
 * choice is not part of how the author reached it.
 */
export function crumbsForSceneIndex(
  trail: BranchBreadcrumbItem[],
  sceneIndex: number,
): BranchBreadcrumbItem[] {
  if (sceneIndex <= 0) return [];
  return trail.filter((crumb) => crumb.sceneIndex < sceneIndex);
}
