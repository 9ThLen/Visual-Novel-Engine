import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { computeSceneRevision } from './scene-revision';
import type { AiScenePatch, ScenePatchOperation } from './scene-patch-types';

export type PatchProjectContext = { sceneIds: string[]; characterIds: string[]; variableNames: string[]; assetIds: string[] };
export interface ScenePatchDescription { sceneId: string; sceneName: string; changes: Array<{ kind: 'step_added'; step: TimelineStep; index: number } | { kind: 'step_removed'; step: TimelineStep } | { kind: 'step_changed'; before: TimelineStep; after: TimelineStep } | { kind: 'metadata_changed'; field: 'name' | 'description' | 'tags'; before: unknown; after: unknown } | { kind: 'connection_changed'; outputPort: string; before: string | null; after: string | null }>; warnings: string[] }
export class InvalidPatchError extends Error { constructor(message: string) { super(message); this.name = 'InvalidPatchError'; } }

function clone<T>(value: T): T { return structuredClone(value); }
function applyOperation(scene: SceneRecord, operation: ScenePatchOperation): void {
  if (operation.op === 'insert_steps') { const index = operation.afterStepId === null ? 0 : scene.timeline.findIndex(s => s.id === operation.afterStepId) + 1; if (index < 0) throw new InvalidPatchError(`Unknown afterStepId: ${operation.afterStepId}`); scene.timeline.splice(index, 0, ...clone(operation.steps)); }
  else if (operation.op === 'replace_step') { const index = scene.timeline.findIndex(s => s.id === operation.stepId); if (index < 0) throw new InvalidPatchError(`Unknown stepId: ${operation.stepId}`); scene.timeline[index] = clone(operation.step); }
  else if (operation.op === 'delete_steps') { const ids = new Set(operation.stepIds); scene.timeline = scene.timeline.filter(s => !ids.has(s.id)); }
  else if (operation.op === 'update_scene_metadata') Object.assign(scene, clone(operation.updates));
  else { const index = scene.connections.findIndex(c => c.outputPort === operation.outputPort); if (operation.targetSceneId === null) { if (index >= 0) scene.connections.splice(index, 1); } else { const connection = { outputPort: operation.outputPort, targetSceneId: operation.targetSceneId, ...(operation.label === undefined ? {} : { label: operation.label }) }; if (index < 0) scene.connections.push(connection); else scene.connections[index] = connection; } }
}

function references(step: TimelineStep): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const walk = (value: unknown, key = ''): void => { if (Array.isArray(value)) value.forEach(item => walk(item, key)); else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k)); else if (typeof value === 'string' && ['characterId', 'variableName', 'assetId', 'targetSceneId'].includes(key)) found.push([key, value]); };
  walk(step.data); walk(step.conditions);
  return found;
}

export function validateAiScenePatch(scene: SceneRecord, patch: AiScenePatch, ctx: PatchProjectContext): { ok: true; warnings: string[] } | { ok: false; code: 'STALE_REVISION' | 'VALIDATION_FAILED'; errors: string[] } {
  if (patch.expectedRevision !== computeSceneRevision(scene)) return { ok: false, code: 'STALE_REVISION', errors: [`Expected revision ${patch.expectedRevision} does not match current scene revision`] };
  const errors: string[] = []; const working = clone(scene);
  if (patch.storyId !== scene.storyId) errors.push(`Patch storyId '${patch.storyId}' does not match '${scene.storyId}'`);
  if (patch.sceneId !== scene.id) errors.push(`Patch sceneId '${patch.sceneId}' does not match '${scene.id}'`);
  const allowed: Record<string, Set<string>> = { characterId: new Set(ctx.characterIds), variableName: new Set(ctx.variableNames), assetId: new Set(ctx.assetIds), targetSceneId: new Set(ctx.sceneIds) };
  for (const operation of patch.operations) {
    if (operation.op === 'insert_steps' && operation.afterStepId !== null && !working.timeline.some(s => s.id === operation.afterStepId)) errors.push(`afterStepId '${operation.afterStepId}' does not exist`);
    if (operation.op === 'replace_step' && !working.timeline.some(s => s.id === operation.stepId)) errors.push(`stepId '${operation.stepId}' does not exist`);
    if (operation.op === 'delete_steps') operation.stepIds.filter(id => !working.timeline.some(s => s.id === id)).forEach(id => errors.push(`stepId '${id}' does not exist`));
    if (operation.op === 'set_connection' && operation.targetSceneId !== null && !allowed.targetSceneId.has(operation.targetSceneId)) errors.push(`targetSceneId '${operation.targetSceneId}' does not exist`);
    const incoming = operation.op === 'insert_steps' ? operation.steps : operation.op === 'replace_step' ? [operation.step] : [];
    incoming.forEach(step => references(step).forEach(([kind, id]) => { if (!allowed[kind].has(id)) errors.push(`${kind} '${id}' does not exist`); }));
    if (errors.length) continue;
    applyOperation(working, operation);
    const ids = working.timeline.map(s => s.id); new Set(ids.filter((id, i) => ids.indexOf(id) !== i)).forEach(id => errors.push(`Duplicate step id '${id}'`));
    const labels = new Set(working.timeline.filter(s => s.blockType === 'label').map(s => (s.data as { name: string }).name));
    working.timeline.filter(s => s.blockType === 'goto').forEach(s => { const d = s.data as { targetLabel: string; elseTargetLabel?: string | null }; [d.targetLabel, d.elseTargetLabel].filter(Boolean).forEach(label => { if (!labels.has(label!)) errors.push(`goto references missing label '${label}'`); }); });
  }
  return errors.length ? { ok: false, code: 'VALIDATION_FAILED', errors } : { ok: true, warnings: [] };
}

export function applyAiScenePatch(scene: SceneRecord, patch: AiScenePatch): SceneRecord { const result = clone(scene); patch.operations.forEach(op => applyOperation(result, op)); return result; }

export function describeAiScenePatch(scene: SceneRecord, patch: AiScenePatch): ScenePatchDescription {
  const working = clone(scene); const changes: ScenePatchDescription['changes'] = [];
  for (const op of patch.operations) {
    if (op.op === 'insert_steps') { const start = op.afterStepId === null ? 0 : working.timeline.findIndex(s => s.id === op.afterStepId) + 1; op.steps.forEach((step, offset) => changes.push({ kind: 'step_added', step: clone(step), index: start + offset })); }
    else if (op.op === 'replace_step') { const before = working.timeline.find(s => s.id === op.stepId); if (!before) throw new InvalidPatchError(`Unknown stepId: ${op.stepId}`); changes.push({ kind: 'step_changed', before: clone(before), after: clone(op.step) }); }
    else if (op.op === 'delete_steps') op.stepIds.forEach(id => { const step = working.timeline.find(s => s.id === id); if (!step) throw new InvalidPatchError(`Unknown stepId: ${id}`); changes.push({ kind: 'step_removed', step: clone(step) }); });
    else if (op.op === 'update_scene_metadata') (['name', 'description', 'tags'] as const).forEach(field => { if (field in op.updates) changes.push({ kind: 'metadata_changed', field, before: clone(working[field]), after: clone(op.updates[field]) }); });
    else { const before = working.connections.find(c => c.outputPort === op.outputPort)?.targetSceneId ?? null; changes.push({ kind: 'connection_changed', outputPort: op.outputPort, before, after: op.targetSceneId }); }
    applyOperation(working, op);
  }
  return { sceneId: scene.id, sceneName: scene.name, changes, warnings: [] };
}
