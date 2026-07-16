import { z } from 'zod';

import type { Character } from '@/lib/character-types';
import { createNextSceneRecordAfter, insertSceneAfter } from '@/lib/document-editor/next-scene';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { generateId as generateProjectId } from '@/lib/id-utils';
import {
  applyAiScenePatch,
  describeAiScenePatch,
  validateAiScenePatch,
  type PatchProjectContext,
  type ScenePatchDescription,
} from './scene-patch';
import { scenePatchOperationSchema, timelineStepSchema, type ScenePatchOperation } from './scene-patch-types';
import { computeSceneRevision, hashStable } from './scene-revision';

export interface AiCharacterCreate {
  tempId: string;
  name: string;
  color?: string;
}

export interface AiCharacterUpdate {
  characterId: string;
  updates: { name?: string; color?: string };
}

export type AiChangeSetItem =
  | { kind: 'create_character'; character: AiCharacterCreate }
  | { kind: 'update_character'; update: AiCharacterUpdate }
  | { kind: 'create_scene'; tempId: string; afterRef: string; name: string; description?: string; timeline: TimelineStep[] }
  | { kind: 'patch_scene'; sceneRef: string; operations: ScenePatchOperation[] }
  | { kind: 'set_choice_target'; sceneRef: string; choiceStepId: string; optionId: string; targetRef: string | null }
  | { kind: 'set_connection'; sceneRef: string; outputPort: string; targetRef: string | null };

export interface AiChangeSet {
  storyId: string;
  expectedSceneRevisions: Record<string, string>;
  expectedCharacterRevision?: string;
  items: AiChangeSetItem[];
  explanation: string;
}

export const AI_CHANGE_SET_ERROR_CODES = {
  ITEM_ORDER: 'ITEM_ORDER',
  MISSING_REVISION: 'MISSING_REVISION',
  STALE_REVISION: 'STALE_REVISION',
  ID_COLLISION: 'ID_COLLISION',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export type AiChangeSetErrorCode = typeof AI_CHANGE_SET_ERROR_CODES[keyof typeof AI_CHANGE_SET_ERROR_CODES];
export type AiChangeSetFailure = { ok: false; code: AiChangeSetErrorCode; message: string };
export type AiChangeSetApplyResult = {
  ok: true;
  scenesToSave: SceneRecord[];
  sceneIdsCreated: string[];
  nextSceneOrder: string[];
  charactersToSave?: Character[];
  connectionsToSet: Array<{ sceneId: string; outputPort: string; targetSceneId: string | null }>;
} | AiChangeSetFailure;

export interface AiChangeSetDescription {
  scenes: Array<
    | { kind: 'created'; sceneRef: string; name: string; stepCount: number; teaser?: string }
    | { kind: 'modified'; sceneRef: string; changes: ScenePatchDescription['changes'] }
  >;
  characters: Array<{ kind: 'created' | 'updated'; ref: string; name?: string }>;
  connections: Array<{ sceneRef: string; targetRef: string | null; outputPort: string; label?: string }>;
  warnings: string[];
}

const characterCreateSchema = z.object({ tempId: z.string().regex(/^newchar:/), name: z.string().min(1), color: z.string().optional() });
const characterUpdateSchema = z.object({ characterId: z.string().min(1), updates: z.object({ name: z.string().optional(), color: z.string().optional() }) });

export const aiChangeSetSchema = z.object({
  storyId: z.string().min(1),
  expectedSceneRevisions: z.record(z.string(), z.string()),
  expectedCharacterRevision: z.string().optional(),
  items: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('create_character'), character: characterCreateSchema }),
    z.object({ kind: z.literal('update_character'), update: characterUpdateSchema }),
    z.object({ kind: z.literal('create_scene'), tempId: z.string().regex(/^new:/), afterRef: z.string().min(1), name: z.string().min(1), description: z.string().optional(), timeline: z.array(timelineStepSchema) }),
    z.object({ kind: z.literal('patch_scene'), sceneRef: z.string().min(1), operations: z.array(scenePatchOperationSchema) }),
    z.object({ kind: z.literal('set_choice_target'), sceneRef: z.string().min(1), choiceStepId: z.string().min(1), optionId: z.string().min(1), targetRef: z.string().nullable() }),
    z.object({ kind: z.literal('set_connection'), sceneRef: z.string().min(1), outputPort: z.string().min(1), targetRef: z.string().nullable() }),
  ])).min(1).max(20),
  explanation: z.string(),
}) satisfies z.ZodType<AiChangeSet>;

export interface AiChangeSetState {
  scenes: Map<string, SceneRecord>;
  characters: Character[];
  context: PatchProjectContext;
}

export interface AiChangeSetApplyOptions {
  generateId?: (prefix: 'scene' | 'character') => string;
  now?: () => number;
}

const fail = (code: AiChangeSetErrorCode, message: string): AiChangeSetFailure => ({ ok: false, code, message });
const clone = <T>(value: T): T => structuredClone(value);

export function computeCharacterLibraryRevision(characters: Character[]): string {
  return hashStable(characters);
}

function itemRank(item: AiChangeSetItem): number {
  if (item.kind === 'create_character' || item.kind === 'update_character') return 0;
  if (item.kind === 'create_scene') return 1;
  if (item.kind === 'patch_scene') return 2;
  return 3;
}

function touchedExistingScenes(changeSet: AiChangeSet, scenes: Map<string, SceneRecord>): Set<string> {
  const touched = new Set<string>();
  for (const item of changeSet.items) {
    if ('sceneRef' in item && scenes.has(item.sceneRef)) touched.add(item.sceneRef);
  }
  return touched;
}

export function validateAiChangeSet(changeSet: AiChangeSet, state: AiChangeSetState): { ok: true; warnings: string[] } | AiChangeSetFailure {
  const parsed = aiChangeSetSchema.safeParse(changeSet);
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues.map(issue => issue.message).join('; '));

  let previousRank = -1;
  for (const item of changeSet.items) {
    const rank = itemRank(item);
    if (rank < previousRank) return fail('ITEM_ORDER', `Item '${item.kind}' appears after a later phase`);
    previousRank = rank;
  }

  const sceneTempIds = changeSet.items.filter((item): item is Extract<AiChangeSetItem, { kind: 'create_scene' }> => item.kind === 'create_scene').map(item => item.tempId);
  const characterTempIds = changeSet.items.filter((item): item is Extract<AiChangeSetItem, { kind: 'create_character' }> => item.kind === 'create_character').map(item => item.character.tempId);
  if (new Set(sceneTempIds).size !== sceneTempIds.length || new Set(characterTempIds).size !== characterTempIds.length) {
    return fail('VALIDATION_FAILED', 'Temporary ids must be unique');
  }

  for (const sceneId of touchedExistingScenes(changeSet, state.scenes)) {
    if (!(sceneId in changeSet.expectedSceneRevisions)) return fail('MISSING_REVISION', `Missing revision for scene '${sceneId}'`);
    if (state.scenes.get(sceneId)?.storyId !== changeSet.storyId) return fail('VALIDATION_FAILED', `Scene '${sceneId}' belongs to another story`);
  }
  for (const [sceneId, revision] of Object.entries(changeSet.expectedSceneRevisions)) {
    const scene = state.scenes.get(sceneId);
    if (!scene) return fail('VALIDATION_FAILED', `Unknown revision scene '${sceneId}'`);
    if (computeSceneRevision(scene) !== revision) return fail('STALE_REVISION', `Scene '${sceneId}' has changed`);
  }

  const hasCharacterItems = changeSet.items.some(item => item.kind === 'create_character' || item.kind === 'update_character');
  if (hasCharacterItems && !changeSet.expectedCharacterRevision) return fail('MISSING_REVISION', 'Missing character-library revision');
  if (changeSet.expectedCharacterRevision && computeCharacterLibraryRevision(state.characters) !== changeSet.expectedCharacterRevision) {
    return fail('STALE_REVISION', 'Character library has changed');
  }
  return { ok: true, warnings: [] };
}

function allocateId(
  prefix: 'scene' | 'character',
  occupied: Set<string>,
  generateId: (prefix: 'scene' | 'character') => string,
): string | undefined {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const id = generateId(prefix);
    if (!occupied.has(id)) {
      occupied.add(id);
      return id;
    }
  }
  return undefined;
}

/** Resolves only canonical reference property names; arbitrary strings remain untouched. */
function resolveDeep<T>(value: T, sceneRefs: Map<string, string>, characterRefs: Map<string, string>): T | undefined {
  let invalid = false;
  const walk = (current: unknown, key?: string): unknown => {
    if (Array.isArray(current)) return current.map(entry => walk(entry));
    if (current && typeof current === 'object') return Object.fromEntries(Object.entries(current).map(([childKey, child]) => [childKey, walk(child, childKey)]));
    if (typeof current !== 'string') return current;
    if (key === 'targetSceneId' && current.startsWith('new:')) {
      const resolved = sceneRefs.get(current); if (!resolved) invalid = true; return resolved ?? current;
    }
    if (key === 'characterId' && current.startsWith('newchar:')) {
      const resolved = characterRefs.get(current); if (!resolved) invalid = true; return resolved ?? current;
    }
    return current;
  };
  const resolved = walk(value) as T;
  return invalid ? undefined : resolved;
}

function findDuplicateStepId(scenes: Map<string, SceneRecord>): string | undefined {
  const seen = new Set<string>();
  for (const scene of scenes.values()) for (const step of scene.timeline) {
    if (seen.has(step.id)) return step.id;
    seen.add(step.id);
  }
  return undefined;
}

function setConnection(scene: SceneRecord, outputPort: string, targetSceneId: string | null, label?: string): void {
  const index = scene.connections.findIndex(connection => connection.outputPort === outputPort);
  if (targetSceneId === null) {
    if (index >= 0) scene.connections.splice(index, 1);
  } else {
    const next = { outputPort, targetSceneId, ...(label === undefined ? {} : { label }) };
    if (index >= 0) scene.connections[index] = { ...scene.connections[index], ...next };
    else scene.connections.push(next);
  }
  scene.updatedAt = Date.now();
}

export function applyAiChangeSet(changeSet: AiChangeSet, state: AiChangeSetState, options: AiChangeSetApplyOptions = {}): AiChangeSetApplyResult {
  const validation = validateAiChangeSet(changeSet, state);
  if (!validation.ok) return validation;

  const generateId = options.generateId ?? (prefix => generateProjectId(prefix));
  const now = options.now ?? Date.now;
  const scenes = new Map(Array.from(state.scenes, ([id, scene]) => [id, clone(scene)]));
  let characters = clone(state.characters);
  const sceneRefs = new Map<string, string>();
  const characterRefs = new Map<string, string>();
  const occupiedSceneIds = new Set(scenes.keys());
  const occupiedCharacterIds = new Set(characters.map(character => character.id));

  for (const item of changeSet.items) {
    if (item.kind === 'create_character') {
      const id = allocateId('character', occupiedCharacterIds, generateId);
      if (!id) return fail('ID_COLLISION', `Could not allocate id for '${item.character.tempId}'`);
      characterRefs.set(item.character.tempId, id);
    } else if (item.kind === 'create_scene') {
      const id = allocateId('scene', occupiedSceneIds, generateId);
      if (!id) return fail('ID_COLLISION', `Could not allocate id for '${item.tempId}'`);
      sceneRefs.set(item.tempId, id);
    }
  }

  const sceneIdsCreated: string[] = [];
  const changedSceneIds = new Set<string>();
  const connectionsToSet: Array<{ sceneId: string; outputPort: string; targetSceneId: string | null }> = [];
  let nextSceneOrder = [...(state.context.sceneOrder ?? state.context.sceneIds)];
  const siblingCounts = new Map<string, number>();
  const lastInsertedAfterAnchor = new Map<string, string>();
  let charactersChanged = false;

  for (const item of changeSet.items) {
    if (item.kind === 'create_character') {
      if (characters.some(character => character.name.trim().toLocaleLowerCase() === item.character.name.trim().toLocaleLowerCase())) {
        return fail('VALIDATION_FAILED', `Character name '${item.character.name}' already exists`);
      }
      const id = characterRefs.get(item.character.tempId)!;
      characters.push({ id, name: item.character.name, ...(item.character.color === undefined ? {} : { color: item.character.color }), sprites: [], createdAt: now() });
      charactersChanged = true;
      continue;
    }
    if (item.kind === 'update_character') {
      const characterId = characterRefs.get(item.update.characterId) ?? item.update.characterId;
      const index = characters.findIndex(character => character.id === characterId);
      if (index < 0) return fail('VALIDATION_FAILED', `Unknown character '${item.update.characterId}'`);
      if (item.update.updates.name && characters.some((character, candidate) => candidate !== index && character.name.trim().toLocaleLowerCase() === item.update.updates.name!.trim().toLocaleLowerCase())) {
        return fail('VALIDATION_FAILED', `Character name '${item.update.updates.name}' already exists`);
      }
      characters[index] = { ...characters[index], ...item.update.updates };
      charactersChanged = true;
      continue;
    }
    if (item.kind === 'create_scene') {
      const afterId = sceneRefs.get(item.afterRef) ?? item.afterRef;
      const source = scenes.get(afterId);
      if (!source) return fail('VALIDATION_FAILED', `Unknown afterRef '${item.afterRef}'`);
      if (source.storyId !== changeSet.storyId) return fail('VALIDATION_FAILED', `Anchor '${item.afterRef}' belongs to another story`);
      const timeline = resolveDeep(item.timeline, sceneRefs, characterRefs);
      if (!timeline) return fail('VALIDATION_FAILED', `Unknown temporary reference in scene '${item.tempId}'`);
      const created = createNextSceneRecordAfter(source, [...scenes.values()]);
      const sibling = siblingCounts.get(afterId) ?? 0;
      siblingCounts.set(afterId, sibling + 1);
      const createdAt = now();
      const baseScene: SceneRecord = { ...created, id: sceneRefs.get(item.tempId)!, name: item.name, description: item.description ?? '', timeline: [], flowY: created.flowY + sibling * 180, createdAt, updatedAt: createdAt };
      const initialPatch = {
        storyId: changeSet.storyId,
        sceneId: baseScene.id,
        expectedRevision: computeSceneRevision(baseScene),
        operations: [{ op: 'insert_steps' as const, afterStepId: null, steps: timeline }],
        explanation: changeSet.explanation,
      };
      const initialContext: PatchProjectContext = {
        ...state.context,
        // All temp ids are allocated up front, so forward timeline targets are valid.
        sceneIds: [...occupiedSceneIds],
        characterIds: characters.map(character => character.id),
        sceneOrder: nextSceneOrder,
      };
      const initialValidation = validateAiScenePatch(baseScene, initialPatch, initialContext);
      if (!initialValidation.ok) return fail('VALIDATION_FAILED', initialValidation.errors.join('; '));
      const scene = applyAiScenePatch(baseScene, initialPatch);
      scenes.set(scene.id, scene);
      sceneIdsCreated.push(scene.id);
      changedSceneIds.add(scene.id);
      const insertionAnchor = lastInsertedAfterAnchor.get(afterId) ?? afterId;
      nextSceneOrder = insertSceneAfter(nextSceneOrder, insertionAnchor, scene.id);
      lastInsertedAfterAnchor.set(afterId, scene.id);
      continue;
    }

    const sceneId = sceneRefs.get(item.sceneRef) ?? item.sceneRef;
    const scene = scenes.get(sceneId);
    if (!scene) return fail('VALIDATION_FAILED', `Unknown sceneRef '${item.sceneRef}'`);
    if (item.kind === 'patch_scene') {
      const operations = resolveDeep(item.operations, sceneRefs, characterRefs);
      if (!operations) return fail('VALIDATION_FAILED', `Unknown temporary reference in patch for '${item.sceneRef}'`);
      const patch = { storyId: changeSet.storyId, sceneId, expectedRevision: computeSceneRevision(scene), operations, explanation: changeSet.explanation };
      const context: PatchProjectContext = { ...state.context, sceneIds: [...scenes.keys()], characterIds: characters.map(character => character.id), sceneOrder: nextSceneOrder };
      const patchValidation = validateAiScenePatch(scene, patch, context);
      if (!patchValidation.ok) return fail('VALIDATION_FAILED', patchValidation.errors.join('; '));
      scenes.set(sceneId, applyAiScenePatch(scene, patch));
      for (const operation of operations) if (operation.op === 'set_connection') {
        connectionsToSet.push({ sceneId, outputPort: operation.outputPort, targetSceneId: operation.targetSceneId });
      }
      changedSceneIds.add(sceneId);
    } else {
      const targetSceneId = item.targetRef === null ? null : (sceneRefs.get(item.targetRef) ?? item.targetRef);
      if (targetSceneId !== null && !scenes.has(targetSceneId)) return fail('VALIDATION_FAILED', `Unknown targetRef '${item.targetRef}'`);
      if (item.kind === 'set_choice_target') {
        const choice = scene.timeline.find(step => step.id === item.choiceStepId && step.blockType === 'choice');
        if (!choice) return fail('VALIDATION_FAILED', `Unknown choice step '${item.choiceStepId}'`);
        const options = (choice.data as { options?: Array<{ id: string; targetSceneId: string | null }> }).options;
        const option = options?.find(candidate => candidate.id === item.optionId);
        if (!option) return fail('VALIDATION_FAILED', `Unknown choice option '${item.optionId}'`);
        option.targetSceneId = targetSceneId;
        setConnection(scene, item.optionId, targetSceneId, (option as { text?: string }).text);
        connectionsToSet.push({ sceneId, outputPort: item.optionId, targetSceneId });
      } else {
        setConnection(scene, item.outputPort, targetSceneId);
        connectionsToSet.push({ sceneId, outputPort: item.outputPort, targetSceneId });
      }
      changedSceneIds.add(sceneId);
    }

    const duplicateId = findDuplicateStepId(scenes);
    if (duplicateId) return fail('VALIDATION_FAILED', `Duplicate step id '${duplicateId}' across story`);
  }

  const duplicateId = findDuplicateStepId(scenes);
  if (duplicateId) return fail('VALIDATION_FAILED', `Duplicate step id '${duplicateId}' across story`);
  return {
    ok: true,
    scenesToSave: [...changedSceneIds].map(id => scenes.get(id)!),
    sceneIdsCreated,
    nextSceneOrder,
    ...(charactersChanged ? { charactersToSave: characters } : {}),
    connectionsToSet,
  };
}

function firstDialogueTeaser(timeline: TimelineStep[]): string | undefined {
  for (const step of timeline) {
    if (step.blockType !== 'dialogue') continue;
    const text = (step.data as { entries?: Array<{ text?: string }> }).entries?.find(entry => entry.text)?.text;
    if (text) return text.slice(0, 120);
  }
  return undefined;
}

export function describeAiChangeSet(changeSet: AiChangeSet, state: Pick<AiChangeSetState, 'scenes' | 'characters'>): AiChangeSetDescription {
  const scenes: AiChangeSetDescription['scenes'] = [];
  const characters: AiChangeSetDescription['characters'] = [];
  const connections: AiChangeSetDescription['connections'] = [];
  for (const item of changeSet.items) {
    if (item.kind === 'create_character') characters.push({ kind: 'created', ref: item.character.tempId, name: item.character.name });
    else if (item.kind === 'update_character') characters.push({ kind: 'updated', ref: item.update.characterId, name: item.update.updates.name });
    else if (item.kind === 'create_scene') scenes.push({ kind: 'created', sceneRef: item.tempId, name: item.name, stepCount: item.timeline.length, teaser: firstDialogueTeaser(item.timeline) });
    else if (item.kind === 'patch_scene') {
      const scene = state.scenes.get(item.sceneRef);
      if (!scene) continue;
      const description = describeAiScenePatch(scene, { storyId: changeSet.storyId, sceneId: scene.id, expectedRevision: computeSceneRevision(scene), operations: item.operations, explanation: changeSet.explanation });
      scenes.push({ kind: 'modified', sceneRef: item.sceneRef, changes: description.changes });
    } else if (item.kind === 'set_choice_target') {
      const scene = state.scenes.get(item.sceneRef);
      const choice = scene?.timeline.find(step => step.id === item.choiceStepId && step.blockType === 'choice');
      const label = ((choice?.data as { options?: Array<{ id: string; text: string }> } | undefined)?.options ?? []).find(option => option.id === item.optionId)?.text;
      connections.push({ sceneRef: item.sceneRef, targetRef: item.targetRef, outputPort: item.optionId, label });
    } else connections.push({ sceneRef: item.sceneRef, targetRef: item.targetRef, outputPort: item.outputPort });
  }
  return { scenes, characters, connections, warnings: [] };
}
