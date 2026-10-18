import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { applyAiScenePatch, describeAiScenePatch, validateAiScenePatch } from '@/lib/ai/scene-patch';
import type { AiScenePatch, ScenePatchOperation } from '@/lib/ai/scene-patch-types';

const text = (id: string, content = id): TimelineStep => ({ id, blockType: 'text', data: { content, typewriterSpeed: 1, anchorTo: 'background' }, collapsed: false, enabled: true });
const scene = (): SceneRecord => ({ id: 'scene-1', storyId: 'story-1', name: 'Scene', description: 'Desc', tags: ['a'], timeline: [text('a')], sceneState: {} as SceneRecord['sceneState'], flowX: 1, flowY: 2, connections: [], isStart: true, createdAt: 1, updatedAt: 2 });
const ctx = { sceneIds: ['scene-1', 'scene-2'], characterIds: ['char-1'], spritesByCharacterId: { 'char-1': ['sprite-1'] }, variableNames: ['score'], assetIds: ['asset-1'] };
const patch = (s: SceneRecord, ...operations: ScenePatchOperation[]): AiScenePatch => ({ storyId: s.storyId, sceneId: s.id, expectedRevision: computeSceneRevision(s), operations, explanation: 'ignored' });
const deepFreeze = <T>(value: T): T => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

describe('ScenePatch', () => {
  it.each([
    [{ op: 'insert_steps', afterStepId: 'a', steps: [text('b')] }, ['a', 'b']],
    [{ op: 'replace_step', stepId: 'a', step: text('replacement') }, ['replacement']],
    [{ op: 'delete_steps', stepIds: ['a'] }, []],
  ] as Array<[ScenePatchOperation, string[]]>)('applies timeline operation $op', (operation, ids) => { const s = scene(); const p = patch(s, operation); expect(validateAiScenePatch(s, p, ctx).ok).toBe(true); expect(applyAiScenePatch(s, p).timeline.map(x => x.id)).toEqual(ids); });

  it('updates metadata', () => { const s = scene(); const p = patch(s, { op: 'update_scene_metadata', updates: { name: 'New', tags: ['x'] } }); expect(applyAiScenePatch(s, p)).toMatchObject({ name: 'New', tags: ['x'] }); expect(describeAiScenePatch(s, p).changes).toHaveLength(2); });
  it('sets and removes a connection', () => { const s = scene(); const add = patch(s, { op: 'set_connection', outputPort: 'next', targetSceneId: 'scene-2', label: 'Next' }); const connected = applyAiScenePatch(s, add); expect(connected.connections[0]).toEqual({ outputPort: 'next', targetSceneId: 'scene-2', label: 'Next' }); expect(applyAiScenePatch(connected, patch(connected, { op: 'set_connection', outputPort: 'next', targetSceneId: null })).connections).toEqual([]); });
  it('detects stale revision', () => { const s = scene(); const p = patch(s); s.name = 'changed'; expect(validateAiScenePatch(s, p, ctx)).toMatchObject({ ok: false, code: 'STALE_REVISION' }); });

  it.each([
    [{ op: 'replace_step', stepId: 'missing', step: text('x') }, 'missing'],
    [{ op: 'insert_steps', afterStepId: 'missing', steps: [text('x')] }, 'missing'],
    [{ op: 'set_connection', outputPort: 'next', targetSceneId: 'missing' }, 'missing'],
    [{ op: 'insert_steps', afterStepId: null, steps: [{ ...text('x'), blockType: 'character', data: { characterId: 'missing', spriteId: '', position: 'left', transition: 'instant', delay: 0, duration: null } }] }, 'missing'],
  ] as Array<[ScenePatchOperation, string]>)('rejects invalid reference naming its id', (operation, id) => { const s = scene(); const result = validateAiScenePatch(s, patch(s, operation), ctx); expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' }); if (!result.ok) expect(result.errors.join(' ')).toContain(id); });

  it('rejects duplicate inserted ids', () => { const s = scene(); expect(validateAiScenePatch(s, patch(s, { op: 'insert_steps', afterStepId: null, steps: [text('x'), text('x')] }), ctx)).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' }); });
  it('validates a sprite against its owning character instead of a flat sprite list', () => {
    const s = scene();
    const step: TimelineStep = { id: 'character', blockType: 'character', data: { characterId: 'char-1', spriteId: 'sprite-other', position: 'left', transition: 'instant', delay: 0, duration: null }, collapsed: false, enabled: true };
    const result = validateAiScenePatch(s, patch(s, { op: 'insert_steps', afterStepId: null, steps: [step] }), ctx);
    expect(result).toMatchObject({ ok: false, errors: [expect.stringContaining("spriteId 'sprite-other' does not exist for characterId 'char-1'")] });
  });
  it('validates operations sequentially', () => { const s = scene(); expect(validateAiScenePatch(s, patch(s, { op: 'insert_steps', afterStepId: 'a', steps: [text('b')] }, { op: 'replace_step', stepId: 'b', step: text('c') }), ctx).ok).toBe(true); expect(validateAiScenePatch(s, patch(s, { op: 'delete_steps', stepIds: ['a'] }, { op: 'replace_step', stepId: 'a', step: text('b') }), ctx)).toMatchObject({ ok: false }); });
  it('rejects deleting a referenced label', () => { const s = scene(); s.timeline = [{ id: 'label', blockType: 'label', data: { name: 'loop' }, collapsed: false, enabled: true }, { id: 'goto', blockType: 'goto', data: { targetLabel: 'loop' }, collapsed: false, enabled: true }]; expect(validateAiScenePatch(s, patch(s, { op: 'delete_steps', stepIds: ['label'] }), ctx)).toMatchObject({ ok: false }); });
  it('does not mutate a deeply frozen input', () => { const s = deepFreeze(scene()); const result = applyAiScenePatch(s, patch(s, { op: 'insert_steps', afterStepId: 'a', steps: [text('b')] })); expect(result).not.toBe(s); expect(s.timeline).toHaveLength(1); });
});

describe('update_step', () => {
  const background = (data: Record<string, unknown> = {}): TimelineStep => ({ id: 'bg', blockType: 'background', data: { assetId: null, transition: 'fade', duration: 0.5, ...data }, collapsed: false, enabled: true, conditions: [] } as unknown as TimelineStep);
  const withBackground = () => { const s = scene(); s.timeline = [background(), text('a')]; return s; };
  const errorsOf = (s: SceneRecord, operation: ScenePatchOperation) => { const result = validateAiScenePatch(s, patch(s, operation), ctx); return result.ok ? [] : result.errors; };

  it('changes the named fields and leaves every other one, and the rest of the step, as it was', () => {
    const s = withBackground();
    const p = patch(s, { op: 'update_step', stepId: 'bg', data: { assetId: 'asset-1', transition: 'dissolve' } });

    expect(validateAiScenePatch(s, p, ctx)).toEqual({ ok: true, warnings: [] });
    const [updated, untouched] = applyAiScenePatch(s, p).timeline;
    expect(updated).toEqual({ ...background(), data: { assetId: 'asset-1', transition: 'dissolve', duration: 0.5 } });
    expect(untouched).toEqual(s.timeline[1]);
  });

  it('is shown as the step it changes, before and after', () => {
    const s = withBackground();

    expect(describeAiScenePatch(s, patch(s, { op: 'update_step', stepId: 'bg', data: { duration: 2 } })).changes).toEqual([
      { kind: 'step_changed', before: background(), after: background({ duration: 2 }) },
    ]);
  });

  it('refuses a field the step’s block type does not have, naming it', () => {
    expect(errorsOf(withBackground(), { op: 'update_step', stepId: 'bg', data: { asset_id: 'asset-1' } }))
      .toEqual(["update_step 'bg': 'asset_id' is not a field of a background step"]);
  });

  it('refuses a value the block type does not accept', () => {
    expect(errorsOf(withBackground(), { op: 'update_step', stepId: 'bg', data: { transition: 'spin' } }))
      .toEqual([expect.stringMatching(/^update_step 'bg': data\.transition: /)]);
  });

  it('checks what the changed settings refer to, as for a new step', () => {
    expect(errorsOf(withBackground(), { op: 'update_step', stepId: 'bg', data: { assetId: 'asset-missing' } }))
      .toEqual(["assetId 'asset-missing' does not exist"]);
  });

  // The demo story's backgrounds point at bundled files the story's library
  // does not list; changing their transition must still go through.
  it('does not hold a setting it leaves alone against the change', () => {
    const s = scene();
    s.timeline = [background({ assetId: 'assets/background/bundled.png' })];

    expect(errorsOf(s, { op: 'update_step', stepId: 'bg', data: { transition: 'dissolve' } })).toEqual([]);
  });

  it('checks a sprite against its character when the change touches either', () => {
    const s = scene();
    s.timeline = [{ id: 'char', blockType: 'character', data: { characterId: 'char-1', spriteId: 'sprite-1', position: 'left', transition: 'instant', delay: 0, duration: null }, collapsed: false, enabled: true }];

    expect(errorsOf(s, { op: 'update_step', stepId: 'char', data: { position: 'right' } })).toEqual([]);
    expect(errorsOf(s, { op: 'update_step', stepId: 'char', data: { spriteId: 'sprite-other' } }))
      .toEqual(["spriteId 'sprite-other' does not exist for characterId 'char-1'"]);
  });

  it('refuses a step that is not there, and a change that names no field', () => {
    expect(errorsOf(withBackground(), { op: 'update_step', stepId: 'missing', data: { duration: 1 } })).toEqual(["stepId 'missing' does not exist"]);
    expect(errorsOf(withBackground(), { op: 'update_step', stepId: 'bg', data: {} })).toEqual(["update_step 'bg': update_step names no field to change"]);
  });

  it('replaces a named field whole, an array included', () => {
    const s = scene();
    s.timeline = [{ id: 'choice', blockType: 'choice', data: { options: [{ id: 'o1', text: 'Stay', targetSceneId: null }, { id: 'o2', text: 'Go', targetSceneId: 'scene-2' }] }, collapsed: false, enabled: true }];
    const options = [{ id: 'o1', text: 'Stay a while', targetSceneId: null }];

    expect(errorsOf(s, { op: 'update_step', stepId: 'choice', data: { options } })).toEqual([]);
    expect(applyAiScenePatch(s, patch(s, { op: 'update_step', stepId: 'choice', data: { options } })).timeline[0].data).toEqual({ options });
  });

  it('follows the operations before it in the same patch', () => {
    const s = scene();
    const inserted = background();

    expect(errorsOf(s, { op: 'update_step', stepId: 'bg', data: { duration: 1 } })).toEqual(["stepId 'bg' does not exist"]);
    expect(validateAiScenePatch(s, patch(s, { op: 'insert_steps', afterStepId: null, steps: [inserted] }, { op: 'update_step', stepId: 'bg', data: { duration: 1 } }), ctx).ok).toBe(true);
  });
});

describe('computeSceneRevision', () => {
  it('is stable across object key order', () => { const a = scene(); const b = { ...a, sceneState: Object.fromEntries(Object.entries(a.sceneState).reverse()) } as SceneRecord; expect(computeSceneRevision(a)).toBe(computeSceneRevision(b)); });
  it('changes with timeline content', () => { const a = scene(); const b = scene(); b.timeline[0] = text('a', 'changed'); expect(computeSceneRevision(a)).not.toBe(computeSceneRevision(b)); });
  it('ignores timestamps and flow position', () => { const a = scene(); const b = { ...a, updatedAt: 999, flowX: 999 }; expect(computeSceneRevision(a)).toBe(computeSceneRevision(b)); });
});
