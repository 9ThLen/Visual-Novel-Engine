import { legacyLineAt } from '@/lib/document-editor/document-scene';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { computeSceneRevision } from './scene-revision';
import { stepDataUpdateProblems, type AiScenePatch, type ScenePatchOperation } from './scene-patch-types';

export type PatchProjectContext = {
  sceneIds: string[];
  characterIds: string[];
  variableNames: string[];
  assetIds: string[];
  /** Sprite ids keyed by owning character. */
  spritesByCharacterId: Record<string, string[]>;
  /** Canonical ordering used by multi-scene changes. Optional for legacy single-scene patches. */
  sceneOrder?: string[];
};
export interface ScenePatchDescription { sceneId: string; sceneName: string; changes: ({ kind: 'step_added'; step: TimelineStep; index: number } | { kind: 'step_removed'; step: TimelineStep } | { kind: 'step_changed'; before: TimelineStep; after: TimelineStep } | { kind: 'metadata_changed'; field: 'name' | 'description' | 'tags'; before: unknown; after: unknown } | { kind: 'connection_changed'; outputPort: string; before: string | null; after: string | null })[]; warnings: string[] }
export class InvalidPatchError extends Error { constructor(message: string) { super(message); this.name = 'InvalidPatchError'; } }

function clone<T>(value: T): T { return structuredClone(value); }
/**
 * The timeline with `step` in place of the step at `index`, still in that
 * step's block. The assistant's step is read through a schema that knows
 * nothing of where steps come from, and may bring an id of its own: the block
 * would otherwise open under another id next time, losing what is anchored to
 * it.
 */
function withReplacedStep(timeline: TimelineStep[], index: number, step: TimelineStep): TimelineStep[] {
  const before = timeline[index];
  const result = [...timeline];
  result[index] = step;
  if (before.originBlockId !== undefined) {
    result[index] = { originBlockId: before.originBlockId, ...(before.originPart !== undefined ? { originPart: before.originPart } : {}), ...step };
    return result;
  }
  // A step that names no block opened under its own id, or in a line under the
  // id of the line's first text. Under the same id it opens as it did.
  if (step.id === before.id) return result;
  const line = legacyLineAt(timeline, index);
  if (!line) {
    result[index] = { originBlockId: before.id, ...step };
  } else if (line.steps.find((member) => member.blockType === 'text') === before) {
    // The line's id is going: every step of it is fastened to that id, as the
    // editor's next save would fasten them.
    for (let part = 0; part < line.steps.length; part += 1) {
      result[line.start + part] = { ...result[line.start + part], originBlockId: before.id, originPart: part };
    }
  }
  return result;
}
/** A step with some fields of its `data` changed. Fields not named stay as they were; a named field is replaced whole. */
function updatedStep(step: TimelineStep, data: Record<string, unknown>): TimelineStep {
  return { ...step, data: { ...(step.data as unknown as Record<string, unknown>), ...clone(data) } } as unknown as TimelineStep;
}
function applyOperation(scene: SceneRecord, operation: ScenePatchOperation): void {
  if (operation.op === 'insert_steps') { const index = operation.afterStepId === null ? 0 : scene.timeline.findIndex(s => s.id === operation.afterStepId) + 1; if (index < 0) throw new InvalidPatchError(`Unknown afterStepId: ${operation.afterStepId}`); scene.timeline.splice(index, 0, ...clone(operation.steps)); }
  else if (operation.op === 'replace_step') { const index = scene.timeline.findIndex(s => s.id === operation.stepId); if (index < 0) throw new InvalidPatchError(`Unknown stepId: ${operation.stepId}`); scene.timeline = withReplacedStep(scene.timeline, index, clone(operation.step)); }
  else if (operation.op === 'update_step') { const index = scene.timeline.findIndex(s => s.id === operation.stepId); if (index < 0) throw new InvalidPatchError(`Unknown stepId: ${operation.stepId}`); scene.timeline[index] = updatedStep(scene.timeline[index], operation.data); }
  else if (operation.op === 'delete_steps') { const ids = new Set(operation.stepIds); scene.timeline = scene.timeline.filter(s => !ids.has(s.id)); }
  else if (operation.op === 'update_scene_metadata') Object.assign(scene, clone(operation.updates));
  else { const index = scene.connections.findIndex(c => c.outputPort === operation.outputPort); if (operation.targetSceneId === null) { if (index >= 0) scene.connections.splice(index, 1); } else { const connection = { outputPort: operation.outputPort, targetSceneId: operation.targetSceneId, ...(operation.label === undefined ? {} : { label: operation.label }) }; if (index < 0) scene.connections.push(connection); else scene.connections[index] = connection; } }
}

function references(step: TimelineStep): [string, string][] {
  const found: [string, string][] = [];
  const walk = (value: unknown, key = ''): void => { if (Array.isArray(value)) value.forEach(item => walk(item, key)); else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k)); else if (typeof value === 'string' && ['characterId', 'variableName', 'assetId', 'targetSceneId'].includes(key)) found.push([key, value]); };
  walk(step.data); walk(step.conditions);
  return found;
}

function characterSpriteReferences(step: TimelineStep): { characterId: string; spriteId: string }[] {
  const data = step.data as unknown as Record<string, unknown>;
  if (step.blockType === 'character' || step.blockType === 'text') {
    return typeof data.characterId === 'string' && typeof data.spriteId === 'string' && data.spriteId
      ? [{ characterId: data.characterId, spriteId: data.spriteId }]
      : [];
  }
  if (step.blockType !== 'dialogue' || !Array.isArray(data.entries)) return [];
  return data.entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const value = entry as Record<string, unknown>;
    return typeof value.characterId === 'string' && typeof value.spriteId === 'string' && value.spriteId
      ? [{ characterId: value.characterId, spriteId: value.spriteId }]
      : [];
  });
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
    incoming.forEach((step) => {
      references(step).forEach(([kind, id]) => { if (!allowed[kind].has(id)) errors.push(`${kind} '${id}' does not exist`); });
      characterSpriteReferences(step).forEach(({ characterId, spriteId }) => {
        if (!(ctx.spritesByCharacterId[characterId] ?? []).includes(spriteId)) {
          errors.push(`spriteId '${spriteId}' does not exist for characterId '${characterId}'`);
        }
      });
    });
    if (operation.op === 'update_step') {
      const current = working.timeline.find(s => s.id === operation.stepId);
      if (!current) errors.push(`stepId '${operation.stepId}' does not exist`);
      else {
        const updated = updatedStep(current, operation.data);
        stepDataUpdateProblems(current.blockType, updated.data as unknown as Record<string, unknown>, Object.keys(operation.data))
          .forEach(problem => errors.push(`update_step '${operation.stepId}': ${problem}`));
        // Only what the change names is the assistant's to answer for. A field
        // left as it was keeps whatever it pointed at — a bundled asset the
        // story's library does not list, say — and must not block the change.
        references({ ...current, data: operation.data as unknown as TimelineStep['data'], conditions: undefined })
          .forEach(([kind, id]) => { if (!allowed[kind].has(id)) errors.push(`${kind} '${id}' does not exist`); });
        const touchesSprite = ['characterId', 'spriteId', 'entries'].some(field => field in operation.data);
        if (touchesSprite) characterSpriteReferences(updated).forEach(({ characterId, spriteId }) => {
          if (!(ctx.spritesByCharacterId[characterId] ?? []).includes(spriteId)) {
            errors.push(`spriteId '${spriteId}' does not exist for characterId '${characterId}'`);
          }
        });
      }
    }
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
    else if (op.op === 'update_step') { const before = working.timeline.find(s => s.id === op.stepId); if (!before) throw new InvalidPatchError(`Unknown stepId: ${op.stepId}`); changes.push({ kind: 'step_changed', before: clone(before), after: updatedStep(before, op.data) }); }
    else if (op.op === 'delete_steps') op.stepIds.forEach(id => { const step = working.timeline.find(s => s.id === id); if (!step) throw new InvalidPatchError(`Unknown stepId: ${id}`); changes.push({ kind: 'step_removed', step: clone(step) }); });
    else if (op.op === 'update_scene_metadata') (['name', 'description', 'tags'] as const).forEach(field => { if (field in op.updates) changes.push({ kind: 'metadata_changed', field, before: clone(working[field]), after: clone(op.updates[field]) }); });
    else { const before = working.connections.find(c => c.outputPort === op.outputPort)?.targetSceneId ?? null; changes.push({ kind: 'connection_changed', outputPort: op.outputPort, before, after: op.targetSceneId }); }
    applyOperation(working, op);
  }
  return { sceneId: scene.id, sceneName: scene.name, changes, warnings: [] };
}
