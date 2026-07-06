import type { ChoiceBlockData, SceneRecord, TimelineStep } from '@/lib/engine/types';

/**
 * Active-path expansion for the document editor.
 *
 * The document renders one linear path through the scene graph. Choice blocks
 * are switch points: `selections` maps a choice step id to the option the
 * author is currently viewing. Path-following semantics mirror the reader
 * (useSceneExecutor): a chosen option with `targetSceneId: null` falls back to
 * the scene's `next` connection — it is NOT "end scene".
 */

/** choiceStepId → optionId the author is currently viewing. */
export type ChoiceSelectionMap = Record<string, string>;

export interface BranchOptionInfo {
  optionId: string;
  text: string;
  targetSceneId: string | null;
  /** Explicit target points to a scene that no longer exists. */
  isBroken: boolean;
  /**
   * No story continues past this option: no explicit target and no usable
   * `next` fallback, or the explicit target is broken. A null target with a
   * working `next` connection is a fallback, not an empty branch.
   */
  isEmpty: boolean;
}

export interface BranchInfo {
  sceneId: string;
  choiceStepId: string;
  options: BranchOptionInfo[];
  /** Effective selection after fallback rules (may differ from the raw map). */
  selectedOptionId: string;
  /** Set when the selected option's explicit target is broken; the path stops at this scene. */
  warning?: 'danglingTarget';
}

export interface ScenePathMetadata {
  /** Number of distinct scenes with a connection into this scene (whole graph, not just active path). */
  incomingCount: number;
  isMergePoint: boolean;
  /**
   * The explicit choice edge this scene was reached through on the active
   * path. Cleared at merge points — scenes shared by several branches are
   * neutral. Used for branch tinting.
   */
  viaChoice?: { choiceStepId: string; optionId: string };
}

export interface ActivePathResult {
  /** Scenes on the active path, in document order. */
  activeScenes: SceneRecord[];
  /** Scenes not reachable along the active path, sorted by createdAt ("Поза сюжетом"). */
  offPathScenes: SceneRecord[];
  metadataBySceneId: Record<string, ScenePathMetadata>;
  branchInfoByChoiceStepId: Record<string, BranchInfo>;
}

function isChoiceStep(step: TimelineStep): step is TimelineStep & { data: ChoiceBlockData } {
  return step.blockType === 'choice' && step.enabled !== false;
}

/** The first enabled choice step with at least one option governs branching, mirroring the reader. */
function findChoiceStep(scene: SceneRecord): (TimelineStep & { data: ChoiceBlockData }) | undefined {
  return scene.timeline.find(
    (step): step is TimelineStep & { data: ChoiceBlockData } =>
      isChoiceStep(step) && (step.data as ChoiceBlockData).options.length > 0,
  );
}

function findNextConnectionTarget(scene: SceneRecord): string | undefined {
  return scene.connections?.find((connection) => connection.outputPort === 'next')?.targetSceneId;
}

function computeIncomingCounts(scenes: SceneRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const scene of scenes) {
    const targets = new Set(
      (scene.connections ?? [])
        .map((connection) => connection.targetSceneId)
        .filter((targetId): targetId is string => Boolean(targetId)),
    );
    for (const targetId of targets) {
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Expands the active path through the scene graph.
 *
 * Rules (must stay in sync with useSceneExecutor):
 * - No choice step → follow the `next` connection.
 * - Choice step: the selected option decides the continuation.
 *   - Missing selection, or selection pointing to a non-existent option → first option.
 *   - Option with explicit target → follow it; if the target scene is missing,
 *     the path stops here with a `danglingTarget` warning (no silent fallback
 *     to another option — the reader would fail at this point too).
 *   - Option with null target → follow the scene's `next` connection; if there
 *     is none, the story ends here.
 * - Cycles are cut at the first revisited scene.
 */
export function expandActivePath(
  scenes: SceneRecord[],
  selections: ChoiceSelectionMap = {},
): ActivePathResult {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const incomingCounts = computeIncomingCounts(scenes);

  const activeScenes: SceneRecord[] = [];
  const metadataBySceneId: Record<string, ScenePathMetadata> = {};
  const branchInfoByChoiceStepId: Record<string, BranchInfo> = {};
  const visited = new Set<string>();

  let current: SceneRecord | undefined = scenes.find((scene) => scene.isStart) ?? scenes[0];
  let viaChoice: ScenePathMetadata['viaChoice'];

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    activeScenes.push(current);

    const incomingCount = incomingCounts.get(current.id) ?? 0;
    const isMergePoint = incomingCount > 1;
    if (isMergePoint) viaChoice = undefined;
    metadataBySceneId[current.id] = {
      incomingCount,
      isMergePoint,
      ...(viaChoice ? { viaChoice } : {}),
    };

    const nextTargetId = findNextConnectionTarget(current);
    const choiceStep = findChoiceStep(current);

    if (!choiceStep) {
      current = nextTargetId ? byId.get(nextTargetId) : undefined;
      continue;
    }

    const data = choiceStep.data as ChoiceBlockData;
    const nextIsUsable = Boolean(nextTargetId && byId.has(nextTargetId));

    const options: BranchOptionInfo[] = data.options.map((option) => {
      const isBroken = Boolean(option.targetSceneId && !byId.has(option.targetSceneId));
      return {
        optionId: option.id,
        text: option.text,
        targetSceneId: option.targetSceneId,
        isBroken,
        isEmpty: isBroken || (!option.targetSceneId && !nextIsUsable),
      };
    });

    const requestedOptionId = selections[choiceStep.id];
    const selected = data.options.find((option) => option.id === requestedOptionId) ?? data.options[0];

    const branchInfo: BranchInfo = {
      sceneId: current.id,
      choiceStepId: choiceStep.id,
      options,
      selectedOptionId: selected.id,
    };

    if (selected.targetSceneId) {
      const target = byId.get(selected.targetSceneId);
      if (!target) {
        // Broken explicit target on the selected option: surface it, don't
        // silently switch branches. The path stops here.
        branchInfo.warning = 'danglingTarget';
        branchInfoByChoiceStepId[choiceStep.id] = branchInfo;
        current = undefined;
        continue;
      }
      viaChoice = { choiceStepId: choiceStep.id, optionId: selected.id };
      branchInfoByChoiceStepId[choiceStep.id] = branchInfo;
      current = target;
      continue;
    }

    branchInfoByChoiceStepId[choiceStep.id] = branchInfo;
    current = nextTargetId ? byId.get(nextTargetId) : undefined;
  }

  const offPathScenes = scenes
    .filter((scene) => !visited.has(scene.id))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  return { activeScenes, offPathScenes, metadataBySceneId, branchInfoByChoiceStepId };
}
