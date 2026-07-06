import type { ChoiceBlockData, SceneRecord, TimelineStep } from '@/lib/engine/types';

/**
 * Whole-graph structural validation for the document editor.
 *
 * Unlike story-path.ts (which expands a single active path following author
 * selections), this module walks every edge in the scene graph — every
 * connection target and every choice option's explicit target — to find
 * structural problems: missing start scene, dangling targets, and scenes
 * unreachable from the start.
 *
 * Path-following semantics mirror the reader (useSceneExecutor) and
 * story-path.ts: a choice option with `targetSceneId: null` follows the
 * scene's `next` connection — it is NOT "end scene" and is therefore never a
 * dangling target on its own.
 */

export interface NoStartSceneIssue {
  type: 'noStartScene';
}

export interface DanglingChoiceTargetIssue {
  type: 'danglingChoiceTarget';
  sceneId: string;
  choiceStepId: string;
  optionId: string;
  targetSceneId: string;
}

export interface DanglingNextTargetIssue {
  type: 'danglingNextTarget';
  sceneId: string;
  targetSceneId: string;
}

export interface UnreachableSceneIssue {
  type: 'unreachableScene';
  sceneId: string;
}

export type SceneGraphIssue =
  | NoStartSceneIssue
  | DanglingChoiceTargetIssue
  | DanglingNextTargetIssue
  | UnreachableSceneIssue;

function isEnabledChoiceStep(step: TimelineStep): step is TimelineStep & { data: ChoiceBlockData } {
  return step.blockType === 'choice' && step.enabled !== false;
}

/**
 * Finds dangling targets: an enabled choice option's explicit targetSceneId
 * that references a scene missing from the list, and a `next` connection
 * whose targetSceneId is missing. Null-target choice options are never
 * dangling — they fall back to the scene's `next` connection.
 */
function findDanglingTargets(
  scenes: SceneRecord[],
  byId: Map<string, SceneRecord>,
): (DanglingChoiceTargetIssue | DanglingNextTargetIssue)[] {
  const issues: (DanglingChoiceTargetIssue | DanglingNextTargetIssue)[] = [];

  for (const scene of scenes) {
    for (const connection of scene.connections ?? []) {
      if (connection.outputPort === 'next' && !byId.has(connection.targetSceneId)) {
        issues.push({
          type: 'danglingNextTarget',
          sceneId: scene.id,
          targetSceneId: connection.targetSceneId,
        });
      }
    }

    for (const step of scene.timeline) {
      if (!isEnabledChoiceStep(step)) continue;
      const data = step.data as ChoiceBlockData;
      for (const option of data.options) {
        if (option.targetSceneId && !byId.has(option.targetSceneId)) {
          issues.push({
            type: 'danglingChoiceTarget',
            sceneId: scene.id,
            choiceStepId: step.id,
            optionId: option.id,
            targetSceneId: option.targetSceneId,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Collects every outgoing edge target from a scene: all connection targets
 * (regardless of outputPort) and every enabled choice option's explicit
 * target. Used for full-graph reachability, which is more permissive than
 * the single active path — any edge can be taken, not just the currently
 * selected branch.
 */
function outgoingTargets(scene: SceneRecord): string[] {
  const targets: string[] = [];
  for (const connection of scene.connections ?? []) {
    targets.push(connection.targetSceneId);
  }
  for (const step of scene.timeline) {
    if (!isEnabledChoiceStep(step)) continue;
    const data = step.data as ChoiceBlockData;
    for (const option of data.options) {
      if (option.targetSceneId) targets.push(option.targetSceneId);
    }
  }
  return targets;
}

/**
 * Finds scenes not reachable from the start scene (isStart, falling back to
 * scenes[0]) by following every edge in the graph. This is full-graph
 * reachability — it does not respect the author's current choice selections
 * the way story-path's active path does.
 */
function findUnreachableScenes(scenes: SceneRecord[], byId: Map<string, SceneRecord>): UnreachableSceneIssue[] {
  const start = scenes.find((scene) => scene.isStart) ?? scenes[0];
  if (!start) return [];

  const visited = new Set<string>();
  const queue: string[] = [start.id];

  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const scene = byId.get(currentId);
    if (!scene) continue;

    for (const targetId of outgoingTargets(scene)) {
      if (!visited.has(targetId) && byId.has(targetId)) {
        queue.push(targetId);
      }
    }
  }

  return scenes
    .filter((scene) => !visited.has(scene.id))
    .map((scene) => ({ type: 'unreachableScene', sceneId: scene.id }));
}

/**
 * Validates the scene graph as a whole, independent of any active-path
 * selection. Returns every structural issue found:
 * - Missing start scene (only reported when there is at least one scene).
 * - Dangling choice/next targets (references to scenes that no longer exist).
 * - Scenes unreachable from the start scene via any edge in the graph.
 */
export function validateSceneGraph(scenes: SceneRecord[]): SceneGraphIssue[] {
  const issues: SceneGraphIssue[] = [];

  if (scenes.length === 0) return issues;

  if (!scenes.some((scene) => scene.isStart)) {
    issues.push({ type: 'noStartScene' });
  }

  const byId = new Map(scenes.map((scene) => [scene.id, scene]));

  issues.push(...findDanglingTargets(scenes, byId));
  issues.push(...findUnreachableScenes(scenes, byId));

  return issues;
}
