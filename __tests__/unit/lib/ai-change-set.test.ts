import type { Character } from '@/lib/character-types';
import {
  applyAiChangeSet,
  computeCharacterLibraryRevision,
  describeAiChangeSet,
  type AiChangeSet,
  type AiChangeSetState,
} from '@/lib/ai/change-set';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { createNextSceneRecordAfter } from '@/lib/document-editor/next-scene';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

const text = (id: string, content = id): TimelineStep => ({ id, blockType: 'text', data: { content, typewriterSpeed: 1, anchorTo: 'background' }, collapsed: false, enabled: true });
const dialogue = (id: string, characterId: string, value = 'Hello'): TimelineStep => ({ id, blockType: 'dialogue', data: { entries: [{ id: `${id}-entry`, characterId, spriteId: '', text: value }], currentEntryIndex: 0 }, collapsed: false, enabled: true });
const choice = (): TimelineStep => ({ id: 'choice-step', blockType: 'choice', data: { options: [{ id: 'left', text: 'Go left', targetSceneId: null }, { id: 'right', text: 'Go right', targetSceneId: null }] }, collapsed: false, enabled: true });
const scene = (id = 'anchor', timeline: TimelineStep[] = [text('existing')]): SceneRecord => ({ id, storyId: 'story', name: id, description: '', tags: [], timeline, sceneState: {} as SceneRecord['sceneState'], flowX: 10, flowY: 20, connections: [], isStart: id === 'anchor', createdAt: 1, updatedAt: 1 });
const character = (): Character => ({ id: 'char-existing', name: 'Existing', sprites: [], createdAt: 1 });

function state(scenes = [scene()], characters = [character()]): AiChangeSetState {
  return {
    scenes: new Map(scenes.map(record => [record.id, record])),
    characters,
    context: { sceneIds: scenes.map(record => record.id), sceneOrder: scenes.map(record => record.id), characterIds: characters.map(entry => entry.id), variableNames: [], assetIds: [] },
  };
}

function changeSet(items: AiChangeSet['items'], current = state()): AiChangeSet {
  const touched = new Set(items.flatMap(item => 'sceneRef' in item && current.scenes.has(item.sceneRef) ? [item.sceneRef] : []));
  return {
    storyId: 'story',
    expectedSceneRevisions: Object.fromEntries([...touched].map(id => [id, computeSceneRevision(current.scenes.get(id)!)])),
    ...(items.some(item => item.kind === 'create_character' || item.kind === 'update_character') ? { expectedCharacterRevision: computeCharacterLibraryRevision(current.characters) } : {}),
    items,
    explanation: 'Build a branch',
  };
}

function ids(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `generated-${index}`;
}

describe('AiChangeSet', () => {
  it('creates a two-scene choice branch with matching connections, item order, and staggered flow', () => {
    const input = state([scene('anchor', [choice()])]);
    const set = changeSet([
      { kind: 'create_scene', tempId: 'new:left', afterRef: 'anchor', name: 'Left', timeline: [text('left-text')] },
      { kind: 'create_scene', tempId: 'new:right', afterRef: 'anchor', name: 'Right', timeline: [text('right-text')] },
      { kind: 'set_choice_target', sceneRef: 'anchor', choiceStepId: 'choice-step', optionId: 'left', targetRef: 'new:left' },
      { kind: 'set_choice_target', sceneRef: 'anchor', choiceStepId: 'choice-step', optionId: 'right', targetRef: 'new:right' },
    ], input);
    const result = applyAiChangeSet(set, input, { generateId: ids('scene-left', 'scene-right'), now: () => 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextSceneOrder).toEqual(['anchor', 'scene-left', 'scene-right']);
    expect(result.connectionsToSet).toEqual([
      { sceneId: 'anchor', outputPort: 'left', targetSceneId: 'scene-left' },
      { sceneId: 'anchor', outputPort: 'right', targetSceneId: 'scene-right' },
    ]);
    const anchor = result.scenesToSave.find(record => record.id === 'anchor')!;
    expect((anchor.timeline[0].data as { options: Array<{ targetSceneId: string }> }).options.map(option => option.targetSceneId)).toEqual(['scene-left', 'scene-right']);
    expect(result.scenesToSave.find(record => record.id === 'scene-left')!.flowY).not.toBe(result.scenesToSave.find(record => record.id === 'scene-right')!.flowY);
  });

  it('resolves a new character in a new scene and rejects reverse phase order', () => {
    const input = state();
    const items: AiChangeSet['items'] = [
      { kind: 'create_character', character: { tempId: 'newchar:hero', name: 'Hero', color: '#fff' } },
      { kind: 'create_scene', tempId: 'new:intro', afterRef: 'anchor', name: 'Intro', timeline: [dialogue('line', 'newchar:hero')] },
    ];
    const result = applyAiChangeSet(changeSet(items, input), input, { generateId: ids('char-hero', 'scene-intro'), now: () => 42 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.charactersToSave?.at(-1)).toEqual({ id: 'char-hero', name: 'Hero', color: '#fff', sprites: [], createdAt: 42 });
      expect((result.scenesToSave[0].timeline[0].data as { entries: Array<{ characterId: string }> }).entries[0].characterId).toBe('char-hero');
    }
    expect(applyAiChangeSet(changeSet([items[1], items[0]], input), input)).toMatchObject({ ok: false, code: 'ITEM_ORDER' });
  });

  it('patches a created scene and resolves a temp target inserted in a choice option', () => {
    const input = state();
    const result = applyAiChangeSet(changeSet([
      { kind: 'create_scene', tempId: 'new:a', afterRef: 'anchor', name: 'A', timeline: [] },
      { kind: 'create_scene', tempId: 'new:b', afterRef: 'new:a', name: 'B', timeline: [] },
      { kind: 'patch_scene', sceneRef: 'new:a', operations: [{ op: 'insert_steps', afterStepId: null, steps: [{ id: 'new-choice', blockType: 'choice', data: { options: [{ id: 'go', text: 'Go', targetSceneId: 'new:b' }] }, collapsed: false, enabled: true }] }] },
    ], input), input, { generateId: ids('scene-a', 'scene-b') });
    expect(result.ok).toBe(true);
    if (result.ok) expect(((result.scenesToSave.find(record => record.id === 'scene-a')!.timeline[0].data as { options: Array<{ targetSceneId: string }> }).options[0].targetSceneId)).toBe('scene-b');
  });

  it.each([
    ['unknown anchor', (input: AiChangeSetState) => changeSet([{ kind: 'create_scene', tempId: 'new:x', afterRef: 'missing', name: 'X', timeline: [] }], input), 'VALIDATION_FAILED'],
    ['missing revision', (input: AiChangeSetState) => ({ ...changeSet([{ kind: 'set_connection', sceneRef: 'anchor', outputPort: 'next', targetRef: null }], input), expectedSceneRevisions: {} }), 'MISSING_REVISION'],
    ['stale scene', (input: AiChangeSetState) => ({ ...changeSet([{ kind: 'set_connection', sceneRef: 'anchor', outputPort: 'next', targetRef: null }], input), expectedSceneRevisions: { anchor: 'stale' } }), 'STALE_REVISION'],
    ['stale characters', (input: AiChangeSetState) => ({ ...changeSet([{ kind: 'update_character', update: { characterId: 'char-existing', updates: { name: 'Renamed' } } }], input), expectedCharacterRevision: 'stale' }), 'STALE_REVISION'],
  ])('rejects %s without partial output', (_name, makeSet, code) => {
    const input = state();
    expect(applyAiChangeSet(makeSet(input), input)).toMatchObject({ ok: false, code });
    expect(input.scenes.get('anchor')?.connections).toEqual([]);
  });

  it('rejects a story-wide duplicate step id', () => {
    const input = state();
    expect(applyAiChangeSet(changeSet([{ kind: 'create_scene', tempId: 'new:x', afterRef: 'anchor', name: 'X', timeline: [text('existing')] }], input), input, { generateId: ids('scene-x') })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('retries one id collision, then fails deterministically', () => {
    const input = state();
    const set = changeSet([{ kind: 'create_scene', tempId: 'new:x', afterRef: 'anchor', name: 'X', timeline: [] }], input);
    expect(applyAiChangeSet(set, input, { generateId: ids('anchor', 'scene-x') })).toMatchObject({ ok: true, sceneIdsCreated: ['scene-x'] });
    expect(applyAiChangeSet(set, input, { generateId: ids('anchor', 'anchor') })).toMatchObject({ ok: false, code: 'ID_COLLISION' });
  });

  it('describes created and modified scenes, characters, and choice labels', () => {
    const input = state([scene('anchor', [choice()])]);
    const description = describeAiChangeSet(changeSet([
      { kind: 'create_character', character: { tempId: 'newchar:hero', name: 'Hero' } },
      { kind: 'create_scene', tempId: 'new:x', afterRef: 'anchor', name: 'X', timeline: [dialogue('line', 'newchar:hero', 'A teaser')] },
      { kind: 'patch_scene', sceneRef: 'anchor', operations: [{ op: 'update_scene_metadata', updates: { name: 'Changed' } }] },
      { kind: 'set_choice_target', sceneRef: 'anchor', choiceStepId: 'choice-step', optionId: 'left', targetRef: 'new:x' },
    ], input), input);
    expect(description.scenes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'created', teaser: 'A teaser' }), expect.objectContaining({ kind: 'modified' })]));
    expect(description.characters[0]).toMatchObject({ kind: 'created', name: 'Hero' });
    expect(description.connections[0]).toMatchObject({ label: 'Go left', targetRef: 'new:x' });
  });

  it('matches canonical new-scene defaults apart from explicit and generated fields', () => {
    const input = state();
    const result = applyAiChangeSet(changeSet([{ kind: 'create_scene', tempId: 'new:x', afterRef: 'anchor', name: 'Custom', timeline: [] }], input), input, { generateId: ids('scene-x'), now: () => 99 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actual = result.scenesToSave[0];
    const canonical = createNextSceneRecordAfter(input.scenes.get('anchor')!, [...input.scenes.values()]);
    expect(actual).toMatchObject({ storyId: canonical.storyId, tags: canonical.tags, sceneState: canonical.sceneState, flowX: canonical.flowX, flowY: canonical.flowY, connections: canonical.connections, isStart: false, name: 'Custom', id: 'scene-x', createdAt: 99, updatedAt: 99 });
  });
});
