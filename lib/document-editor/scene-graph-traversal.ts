import type { ChoiceBlockData, SceneRecord, TimelineStep } from '@/lib/engine/types';

/**
 * Shared scene-graph traversal primitives.
 *
 * Both the whole-graph validator (scene-graph-validator.ts) and the visual
 * layout module (lib/scene-graph-layout.ts) need to walk the exact same set of
 * edges — every connection target plus every enabled choice option's explicit
 * target — so reachability is identical between the "unreachable scene" lint
 * and the tinted-node rendering. Keep the walking logic here, in one place.
 *
 * Path-following semantics mirror the reader (useSceneExecutor) and
 * story-path.ts: a choice option with `targetSceneId: null` follows the
 * scene's `next` connection — it is NOT an edge of its own.
 */

export function isEnabledChoiceStep(
  step: TimelineStep,
): step is TimelineStep & { data: ChoiceBlockData } {
  return step.blockType === 'choice' && step.enabled !== false;
}

/**
 * Every outgoing edge target from a scene: all connection targets (regardless
 * of outputPort) and every enabled choice option's explicit target. Order is
 * deterministic — connections first (in order), then choice options in
 * timeline/option order.
 */
export function sceneOutgoingTargets(scene: SceneRecord): string[] {
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
 * BFS over the full graph from `startId`, returning the set of reachable scene
 * ids (including the start itself). Targets that don't correspond to an
 * existing scene are ignored. Cycles are handled by the visited set. Returns an
 * empty set when `startId` is null or missing from the scene list.
 */
export function collectReachableSceneIds(
  scenes: SceneRecord[],
  startId: string | null,
): Set<string> {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const visited = new Set<string>();
  if (!startId || !byId.has(startId)) return visited;

  const queue: string[] = [startId];
  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const scene = byId.get(currentId);
    if (!scene) continue;

    for (const targetId of sceneOutgoingTargets(scene)) {
      if (!visited.has(targetId) && byId.has(targetId)) {
        queue.push(targetId);
      }
    }
  }

  return visited;
}
