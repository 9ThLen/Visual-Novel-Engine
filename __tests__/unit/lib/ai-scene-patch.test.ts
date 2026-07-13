import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { applyAiScenePatch, describeAiScenePatch, validateAiScenePatch } from '@/lib/ai/scene-patch';
import type { AiScenePatch, ScenePatchOperation } from '@/lib/ai/scene-patch-types';

const text = (id: string, content = id): TimelineStep => ({ id, blockType: 'text', data: { content, typewriterSpeed: 1, anchorTo: 'background' }, collapsed: false, enabled: true });
const scene = (): SceneRecord => ({ id: 'scene-1', storyId: 'story-1', name: 'Scene', description: 'Desc', tags: ['a'], timeline: [text('a')], sceneState: {} as SceneRecord['sceneState'], flowX: 1, flowY: 2, connections: [], isStart: true, createdAt: 1, updatedAt: 2 });
const ctx = { sceneIds: ['scene-1', 'scene-2'], characterIds: ['char-1'], variableNames: ['score'], assetIds: ['asset-1'] };
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
  it('validates operations sequentially', () => { const s = scene(); expect(validateAiScenePatch(s, patch(s, { op: 'insert_steps', afterStepId: 'a', steps: [text('b')] }, { op: 'replace_step', stepId: 'b', step: text('c') }), ctx).ok).toBe(true); expect(validateAiScenePatch(s, patch(s, { op: 'delete_steps', stepIds: ['a'] }, { op: 'replace_step', stepId: 'a', step: text('b') }), ctx)).toMatchObject({ ok: false }); });
  it('rejects deleting a referenced label', () => { const s = scene(); s.timeline = [{ id: 'label', blockType: 'label', data: { name: 'loop' }, collapsed: false, enabled: true }, { id: 'goto', blockType: 'goto', data: { targetLabel: 'loop' }, collapsed: false, enabled: true }]; expect(validateAiScenePatch(s, patch(s, { op: 'delete_steps', stepIds: ['label'] }), ctx)).toMatchObject({ ok: false }); });
  it('does not mutate a deeply frozen input', () => { const s = deepFreeze(scene()); const result = applyAiScenePatch(s, patch(s, { op: 'insert_steps', afterStepId: 'a', steps: [text('b')] })); expect(result).not.toBe(s); expect(s.timeline).toHaveLength(1); });
});

describe('computeSceneRevision', () => {
  it('is stable across object key order', () => { const a = scene(); const b = { ...a, sceneState: Object.fromEntries(Object.entries(a.sceneState).reverse()) } as SceneRecord; expect(computeSceneRevision(a)).toBe(computeSceneRevision(b)); });
  it('changes with timeline content', () => { const a = scene(); const b = scene(); b.timeline[0] = text('a', 'changed'); expect(computeSceneRevision(a)).not.toBe(computeSceneRevision(b)); });
  it('ignores timestamps and flow position', () => { const a = scene(); const b = { ...a, updatedAt: 999, flowX: 999 }; expect(computeSceneRevision(a)).toBe(computeSceneRevision(b)); });
});
