/**
 * Story import / export helpers.
 */

import { buildCanonicalSceneRecordsFromLegacyScenes } from '@/lib/scene-operations';
import { isSafeUri, StoryValidator, ValidationError } from '@/lib/story-validator';
import { generateId } from '@/lib/id-utils';
import {
  BLOCK_TYPE_INFO,
  type BlockType,
  type BlockData,
  type Condition,
  type SceneRecord,
  type TimelineStep,
} from '@/lib/engine/types';
import type { CanonicalStory, StoryMetadata } from '@/lib/story-domain';
import type { AppState } from '@/stores/use-app-store';
import { useAppStore } from '@/stores/use-app-store';
import { normalizeEditorTimeline } from '@/lib/editor-scene-draft';
import {
  CHARACTER_AUTHORING_SCHEMA_VERSION,
  migrateCharacterLibrary,
} from '@/lib/character-migration';
import type { Character } from '@/lib/character-types';
import { shouldLogDevDiagnostics } from '@/lib/dev-logging';

// ── Story import / export — thin wrappers with validation ──

const MAX_JSON_SIZE = 10 * 1024 * 1024;

function buildCanonicalStory(
  metadata: StoryMetadata,
  scenes: Record<string, SceneRecord>,
  characterLibrary: Character[] = []
): CanonicalStory {
  return {
    ...metadata,
    characterAuthoringSchemaVersion:
      metadata.characterAuthoringSchemaVersion ?? CHARACTER_AUTHORING_SCHEMA_VERSION,
    sceneCount: Object.keys(scenes).length,
    scenes,
    characterLibrary: migrateCharacterLibrary(characterLibrary),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isSafeAssetReference(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return false;
  if (trimmed.includes('..') || trimmed.includes('\0')) return false;
  const uriLike = lower.includes('://') || lower.startsWith('/') || lower.startsWith('./') || lower.startsWith('assets/') || lower.startsWith('blob:');
  return uriLike ? isSafeUri(trimmed) : true;
}

function validateConditions(conditions: unknown): conditions is Condition[] | undefined {
  if (conditions === undefined) return true;
  if (!Array.isArray(conditions)) return false;
  return conditions.every((condition) => {
    const c = asRecord(condition);
    return !!c
      && isString(c.variableName)
      && isString(c.operator)
      && (isString(c.value) || isNumber(c.value) || isBoolean(c.value));
  });
}

function validateBlockData(blockType: BlockType, data: unknown): boolean {
  const d = asRecord(data);
  if (!d) return false;

  switch (blockType) {
    case 'background':
      return isSafeAssetReference(d.assetId) && isString(d.transition) && isNumber(d.duration);
    case 'character':
      return isString(d.characterId) && isString(d.spriteId)
        && (d.action === undefined || ['show', 'hide', 'change_sprite', 'move'].includes(String(d.action)))
        && isString(d.position) && isString(d.transition) && isNumber(d.delay)
        && (d.duration === null || isNumber(d.duration));
    case 'text':
      return isString(d.content) && isNumber(d.typewriterSpeed) && isString(d.anchorTo)
        && isSafeAssetReference(d.spriteId);
    case 'dialogue':
      return Array.isArray(d.entries) && d.entries.every((entry) => {
        const e = asRecord(entry);
        return !!e && isString(e.id) && isString(e.characterId) && isString(e.spriteId)
          && isSafeAssetReference(e.spriteId) && isString(e.text);
      }) && isNumber(d.currentEntryIndex);
    case 'choice':
      return Array.isArray(d.options) && d.options.every((option) => {
        const o = asRecord(option);
        return !!o && isString(o.id) && isString(o.text) && isStringOrNull(o.targetSceneId);
      });
    case 'effect':
      return isString(d.effectType) && isString(d.target) && isNumber(d.intensity) && isNumber(d.duration);
    case 'music':
      return isSafeAssetReference(d.assetId) && isString(d.action) && isNumber(d.volume)
        && isBoolean(d.loop) && isNumber(d.fadeDuration);
    case 'sound':
      return isSafeAssetReference(d.assetId) && isString(d.action) && isNumber(d.volume)
        && isBoolean(d.loop) && isNumber(d.pitchVariation);
    case 'interactive_object':
      return isString(d.objectId) && isString(d.name) && isSafeAssetReference(d.assetId)
        && asRecord(d.position) !== null && Array.isArray(d.actions)
        && isBoolean(d.oneTimeOnly) && isBoolean(d.pulseAnimation);
    case 'camera':
      return isString(d.action) && isNumber(d.duration) && isString(d.easing);
    case 'variable':
      return isString(d.variableName) && isString(d.operation)
        && (isString(d.value) || isNumber(d.value) || isBoolean(d.value));
    case 'transition':
      return isStringOrNull(d.targetSceneId) && isString(d.transitionType) && isNumber(d.duration);
    default:
      return false;
  }
}

function validateCanonicalTimelineStep(step: unknown, sceneId: string, index: number): TimelineStep | null {
  const rawStep = asRecord(step);
  if (!rawStep || !isString(rawStep.id) || !isString(rawStep.blockType)) {
    if (shouldLogDevDiagnostics()) console.warn('[importStory] skipped invalid timeline step identity', { sceneId, index });
    return null;
  }

  if (!(rawStep.blockType in BLOCK_TYPE_INFO)) {
    if (shouldLogDevDiagnostics()) console.warn('[importStory] skipped unknown block type', { sceneId, index, blockType: rawStep.blockType });
    return null;
  }

  const blockType = rawStep.blockType as BlockType;
  if (!validateBlockData(blockType, rawStep.data)) {
    if (shouldLogDevDiagnostics()) console.warn('[importStory] skipped invalid block data', { sceneId, index, blockType });
    return null;
  }

  if (typeof rawStep.collapsed !== 'boolean' || typeof rawStep.enabled !== 'boolean' || !validateConditions(rawStep.conditions)) {
    if (shouldLogDevDiagnostics()) console.warn('[importStory] skipped invalid timeline step metadata', { sceneId, index, blockType });
    return null;
  }

  // All validations passed — construct TimelineStep with validated fields
  return {
    id: rawStep.id,
    blockType,
    data: rawStep.data as BlockData,
    collapsed: rawStep.collapsed,
    enabled: rawStep.enabled,
    conditions: rawStep.conditions ?? [],
  };
}

function validateCanonicalTimeline(sceneId: string, timeline: unknown[]): TimelineStep[] {
  if (timeline.length === 0) return [];

  const validSteps = timeline
    .map((step, index) => validateCanonicalTimelineStep(step, sceneId, index))
    .filter((step): step is TimelineStep => step !== null);

  if (validSteps.length === 0) {
    throw new ValidationError(`Scene "${sceneId}" has no valid timeline steps`, `scenes.${sceneId}.timeline`);
  }

  return validSteps;
}

function normalizeImportedSceneRecords(
  storyId: string,
  scenes: Record<string, SceneRecord>,
): Record<string, SceneRecord> {
  const timestamp = Date.now();
  return Object.fromEntries(
    Object.entries(scenes).map(([sceneId, scene]) => [
      sceneId,
      {
        ...scene,
        id: scene.id || sceneId,
        storyId,
        timeline: normalizeEditorTimeline(scene.timeline ?? []),
        createdAt: scene.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
    ]),
  );
}

export async function exportStory(storyId: string, state: AppState): Promise<string> {
  const metadata = state.storiesMetadata.find((s) => s.id === storyId);
  if (!metadata) throw new Error('Story not found');
  const scenes = state.sceneRecordsByStory[storyId] || {};
  const story = buildCanonicalStory(metadata, scenes, state.characterLibraries[storyId] || []);
  return JSON.stringify(story, null, 2);
}

export async function importStory(storyJson: string): Promise<CanonicalStory> {
  if (storyJson.length > MAX_JSON_SIZE) {
    throw new ValidationError(`Story JSON is too large (max ${MAX_JSON_SIZE / 1024 / 1024}MB)`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(storyJson);
  } catch {
    throw new ValidationError('Invalid JSON format');
  }

  const raw = parsed as Record<string, unknown>;
  const rawScenes = raw.scenes;
  const looksCanonical = rawScenes && typeof rawScenes === 'object'
    && Object.values(rawScenes as Record<string, unknown>).some((scene) =>
      !!scene && typeof scene === 'object' && Array.isArray((scene as { timeline?: unknown }).timeline),
    );

  if (looksCanonical) {
    if (typeof raw.title !== 'string' || !raw.title.trim()) {
      throw new ValidationError('Imported canonical story must have a non-empty title', 'title');
    }
    const sceneKeys = Object.keys(rawScenes as Record<string, unknown>);
    if (sceneKeys.length === 0) {
      throw new ValidationError('Imported canonical story must have at least one scene', 'scenes');
    }
    if (typeof raw.startSceneId !== 'string' || !raw.startSceneId) {
      throw new ValidationError('Imported canonical story must have a startSceneId', 'startSceneId');
    }
    if (!(raw.startSceneId in (rawScenes as Record<string, unknown>))) {
      throw new ValidationError(`startSceneId "${raw.startSceneId}" does not reference an existing scene`, 'startSceneId');
    }
    const validatedRawScenes: Record<string, SceneRecord> = {};
    for (const [sceneId, scene] of Object.entries(rawScenes as Record<string, unknown>)) {
      if (!scene || typeof scene !== 'object') {
        throw new ValidationError(`Scene "${sceneId}" must be an object`, `scenes.${sceneId}`);
      }
      const s = scene as Record<string, unknown>;
      if (!Array.isArray(s.timeline)) {
        throw new ValidationError(`Scene "${sceneId}" must have a timeline array`, `scenes.${sceneId}.timeline`);
      }
      validatedRawScenes[sceneId] = {
        ...(s as unknown as SceneRecord),
        timeline: validateCanonicalTimeline(sceneId, s.timeline),
      };
    }
    if (typeof raw.thumbnailUri === 'string' && !isSafeUri(raw.thumbnailUri)) {
      throw new ValidationError('Imported canonical story has an unsafe thumbnailUri', 'thumbnailUri');
    }
    const timestamp = Date.now();
    const storyId = generateId('story');
    const importedScenes = normalizeImportedSceneRecords(storyId, validatedRawScenes);
    const importedCharacterLibrary = migrateCharacterLibrary(
      Array.isArray(raw.characterLibrary)
        ? raw.characterLibrary as Character[]
        : Array.isArray(raw.characters)
          ? raw.characters as Character[]
          : []
    );
    const metadata: StoryMetadata = {
      id: storyId,
      title: typeof raw.title === 'string' ? raw.title : 'Imported Story',
      description: typeof raw.description === 'string' ? raw.description : '',
      author: typeof raw.author === 'string' ? raw.author : '',
      startSceneId: typeof raw.startSceneId === 'string' ? raw.startSceneId : Object.keys(importedScenes)[0] ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
      thumbnailUri: typeof raw.thumbnailUri === 'string' ? raw.thumbnailUri : undefined,
      sceneCount: Object.keys(importedScenes).length,
      characterAuthoringSchemaVersion: CHARACTER_AUTHORING_SCHEMA_VERSION,
    };

    useAppStore.setState((state) => ({
      storiesMetadata: [...state.storiesMetadata, metadata],
      sceneRecordsByStory: {
        ...state.sceneRecordsByStory,
        [storyId]: importedScenes,
      },
      characterLibraries: importedCharacterLibrary.length > 0
        ? {
            ...state.characterLibraries,
            [storyId]: importedCharacterLibrary,
          }
        : state.characterLibraries,
    }));

    return buildCanonicalStory(metadata, importedScenes, importedCharacterLibrary);
  }

  const story = StoryValidator.validateStory(raw);
  story.id = generateId('story');
  story.createdAt = Date.now();
  story.updatedAt = Date.now();

  const importedScenes = buildCanonicalSceneRecordsFromLegacyScenes(
    story.id,
    story.scenes || {},
    story.startSceneId,
  );
  const metadata: StoryMetadata = {
    id: story.id,
    title: story.title,
    description: story.description ?? '',
    author: story.author ?? '',
    startSceneId: story.startSceneId || (Object.keys(importedScenes)[0] ?? ''),
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    thumbnailUri: story.thumbnailUri,
    sceneCount: Object.keys(importedScenes).length,
    characterAuthoringSchemaVersion: CHARACTER_AUTHORING_SCHEMA_VERSION,
  };
  const importedCharacterLibrary = migrateCharacterLibrary(
    Array.isArray((story as unknown as { characters?: unknown }).characters)
      ? (story as unknown as { characters: Character[] }).characters
      : []
  );

  useAppStore.setState((state) => ({
    storiesMetadata: [...state.storiesMetadata, metadata],
    sceneRecordsByStory: {
      ...state.sceneRecordsByStory,
      [story.id]: importedScenes,
    },
    characterLibraries: importedCharacterLibrary.length > 0
      ? {
          ...state.characterLibraries,
          [story.id]: importedCharacterLibrary,
        }
      : state.characterLibraries,
  }));

  return buildCanonicalStory(metadata, importedScenes, importedCharacterLibrary);
}
