import { createNextSceneRecordAfter } from '@/lib/document-editor/next-scene';
import type { ChoiceBlockData, SceneRecord, TimelineStep } from '@/lib/engine/types';

/**
 * Story-graph mutations behind the branch switcher's actions.
 *
 * These are pure: they return new records to persist and never touch stores.
 */

export interface StartBranchResult {
  /** The freshly created target scene for the option. */
  newScene: SceneRecord;
  /** The choice scene with the option retargeted (timeline + connections updated). */
  updatedSourceScene: SceneRecord;
}

function findChoiceStepScene(
  scenes: SceneRecord[],
  choiceStepId: string,
): { scene: SceneRecord; step: TimelineStep } | undefined {
  for (const scene of scenes) {
    const step = scene.timeline.find(
      (candidate) => candidate.id === choiceStepId && candidate.blockType === 'choice',
    );
    if (step) return { scene, step };
  }
  return undefined;
}

/**
 * «Почати гілку»: creates a new scene and points the given choice option at
 * it. Returns undefined when the choice step or option can't be found, or the
 * option already has a working explicit target (starting a branch must never
 * silently overwrite an existing one — a dangling target may be replaced).
 *
 * Both the option's `targetSceneId` in the timeline step and the scene's
 * per-option connection (`outputPort === optionId`) are updated, matching how
 * `documentSceneToConnections` derives connections on save.
 */
export function startBranchScene(
  scenes: SceneRecord[],
  choiceStepId: string,
  optionId: string,
): StartBranchResult | undefined {
  const found = findChoiceStepScene(scenes, choiceStepId);
  if (!found) return undefined;

  const data = found.step.data as ChoiceBlockData;
  const option = data.options.find((candidate) => candidate.id === optionId);
  if (!option) return undefined;

  const byId = new Set(scenes.map((scene) => scene.id));
  if (option.targetSceneId && byId.has(option.targetSceneId)) return undefined;

  const newScene = createNextSceneRecordAfter(found.scene, scenes);

  const timeline = found.scene.timeline.map((step) => {
    if (step.id !== choiceStepId) return step;
    const stepData = step.data as ChoiceBlockData;
    return {
      ...step,
      data: {
        ...stepData,
        options: stepData.options.map((candidate) =>
          candidate.id === optionId ? { ...candidate, targetSceneId: newScene.id } : candidate,
        ),
      },
    };
  });

  const connections = [
    ...(found.scene.connections ?? []).filter((connection) => connection.outputPort !== optionId),
    { targetSceneId: newScene.id, outputPort: optionId, label: option.text },
  ];

  const updatedSourceScene: SceneRecord = {
    ...found.scene,
    timeline,
    connections,
    updatedAt: Date.now(),
  };

  return { newScene, updatedSourceScene };
}

function collectOutgoingTargets(scene: SceneRecord): string[] {
  const connectionTargets = (scene.connections ?? [])
    .map((connection) => connection.targetSceneId)
    .filter((targetId): targetId is string => Boolean(targetId));
  const choiceTargets = scene.timeline.flatMap((step) => {
    if (step.blockType !== 'choice' || step.enabled === false) return [];
    return (step.data as ChoiceBlockData).options
      .map((option) => option.targetSceneId)
      .filter((targetId): targetId is string => Boolean(targetId));
  });
  return [...connectionTargets, ...choiceTargets];
}

function reachableFrom(scenes: SceneRecord[], startId: string, excludeId?: string): Set<string> {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const reachable = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const currentId = queue.pop()!;
    if (currentId === excludeId || reachable.has(currentId)) continue;
    const scene = byId.get(currentId);
    if (!scene) continue;
    reachable.add(currentId);
    queue.push(...collectOutgoingTargets(scene));
  }
  return reachable;
}

/**
 * Scenes that are reachable from the start today (over ALL edges — every
 * connection and every explicit choice target, not just the active path) but
 * would become unreachable if `sceneId` were deleted. Used to warn about
 * orphaned branch tails before deletion.
 */
export function computeOrphanedByDeletion(scenes: SceneRecord[], sceneId: string): SceneRecord[] {
  const start = scenes.find((scene) => scene.isStart) ?? scenes[0];
  if (!start || start.id === sceneId) return [];

  const reachableNow = reachableFrom(scenes, start.id);
  const reachableAfter = reachableFrom(scenes, start.id, sceneId);

  return scenes.filter(
    (scene) =>
      scene.id !== sceneId && reachableNow.has(scene.id) && !reachableAfter.has(scene.id),
  );
}
