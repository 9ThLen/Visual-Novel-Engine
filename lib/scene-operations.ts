import { normalizeEditorTimeline } from '@/lib/editor-scene-draft';
import type { ChoiceBlockData, SceneConnection, SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { SplashScreenConfig } from '@/lib/splash-types';
import type { InteractiveObject } from '@/lib/interactive-types';
import type { AudioLibraryItem, AudioTrigger } from '@/lib/audio-types';
import type { CharacterSprite } from '@/lib/character-types';
import {
  getSceneRecordFromAccess,
  getSceneRecordsForStoryFromAccess,
} from '@/lib/scene-access';

/**
 * @deprecated Legacy type — only used by buildCanonicalSceneRecordsFromLegacyScenes and upsertCanonicalSceneFromLegacyScene.
 * TODO: remove once migrateFromLegacyKeys is removed (2026-Q3).
 */
export interface Choice {
  id: string;
  text: string;
  nextSceneId: string;
}

/**
 * @deprecated Legacy type — use SceneRecord + TimelineStep instead.
 * TODO: remove once migrateFromLegacyKeys is removed (2026-Q3).
 */
export interface StoryScene {
  id: string;
  text: string;
  backgroundImageUri?: string | null;
  characters: CharacterSprite[];
  voiceAudioUri?: string | null;
  choices: Choice[];
  musicUri?: string | null;
  splashScreen?: SplashScreenConfig;
  interactiveObjects?: InteractiveObject[];
  autoAdvance?: {
    enabled: boolean;
    delay: number;
    nextSceneId: string;
  };
  blocks?: TimelineStep[];
  audioTriggers?: AudioTrigger[];
}

/**
 * @deprecated Legacy type — use StoryMetadata + SceneRecord[] instead.
 * TODO: remove once migrateFromLegacyKeys is removed (2026-Q3).
 */
export interface Story {
  id: string;
  title: string;
  description?: string;
  author?: string;
  startSceneId: string;
  scenes: Record<string, StoryScene>;
  audioLibrary?: AudioLibraryItem[];
  createdAt: number;
  updatedAt: number;
  thumbnailUri?: string;
}
import {
  createBackgroundStep,
  createCharacterStep,
  createChoiceStep,
  createInteractiveObjectStep,
  createMusicStep,
  createTextStep,
  createTransitionStep,
} from '@/lib/engine/event-factory';

export interface CanonicalSceneStateSnapshot {
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  storiesMetadata?: StoryMetadata[];
}

export type SceneRecordContentUpdates = Partial<
  Pick<SceneRecord, 'name' | 'description' | 'tags' | 'timeline' | 'sceneState'>
>;

export function updateSceneRecordPreservingMeta(
  existingRecord: SceneRecord,
  updates: SceneRecordContentUpdates
): SceneRecord {
  return {
    ...existingRecord,
    ...updates,
    updatedAt: Date.now(),
  };
}

export function getCanonicalSceneRecordFromState(
  state: CanonicalSceneStateSnapshot,
  storyId: string,
  sceneId: string
): SceneRecord | undefined {
  return getSceneRecordFromAccess(state, storyId, sceneId);
}

export function getCanonicalSceneRecordsForStoryFromState(
  state: CanonicalSceneStateSnapshot,
  storyId: string
): SceneRecord[] {
  return getSceneRecordsForStoryFromAccess(
    { storiesMetadata: state.storiesMetadata || [], sceneRecordsByStory: state.sceneRecordsByStory },
    storyId,
  );
}

export interface CanonicalSceneOperationsSnapshot {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
}

export interface CanonicalStorySeed {
  metadata: StoryMetadata;
  sceneRecord: SceneRecord;
}

function sortSceneRecords(records: Record<string, SceneRecord>): SceneRecord[] {
  return Object.values(records).sort((a, b) => a.createdAt - b.createdAt);
}

function mapLegacyChoicesToConnections(choices: StoryScene['choices'] = []): SceneConnection[] {
  return choices
    .filter((choice) => !!choice.nextSceneId)
    .map((choice, index) => ({
      targetSceneId: choice.nextSceneId,
      outputPort: `choice_${index}`,
      label: choice.text,
    }));
}

const LEGACY_CHARACTER_POSITIONS = new Set(['left', 'center', 'right', 'far-left', 'far-right']);
type CanonicalCharacterPosition = 'left' | 'center' | 'right' | 'far-left' | 'far-right';

function normalizeLegacyCharacterPosition(position: string | undefined): CanonicalCharacterPosition {
  return LEGACY_CHARACTER_POSITIONS.has(position || '') ? position as CanonicalCharacterPosition : 'center';
}

function buildLegacySceneTimeline(scene: StoryScene): TimelineStep[] {
  const timeline: TimelineStep[] = Array.isArray(scene.blocks) && scene.blocks.length > 0
    ? [...scene.blocks]
    : [];

  if (timeline.length === 0) {
    if (scene.backgroundImageUri) {
      timeline.push(createBackgroundStep({ assetId: scene.backgroundImageUri }));
    }

    for (const character of scene.characters || []) {
      timeline.push(createCharacterStep({
        characterId: character.id,
        spriteId: character.uri || character.id,
        position: normalizeLegacyCharacterPosition(character.position),
        transition: 'fade',
      }));
    }

    if (scene.text?.trim()) {
      timeline.push(createTextStep({ content: scene.text }));
    }

    if (scene.choices?.length) {
      timeline.push(createChoiceStep({
        options: scene.choices.map((choice) => ({
          id: choice.id,
          text: choice.text,
          targetSceneId: choice.nextSceneId || null,
        })),
      }));
    }

    if (scene.musicUri) {
      timeline.push(createMusicStep({ assetId: scene.musicUri, mode: 'track' }));
    }

    for (const object of scene.interactiveObjects || []) {
      timeline.push(createInteractiveObjectStep({
        objectId: object.id,
        name: object.name || object.label || object.id,
        assetId: object.imageUri ?? null,
        position: object.position ?? { x: 50, y: 50, width: 10, height: 10 },
        actions: object.actions ?? [],
        oneTimeOnly: object.oneTimeOnly ?? false,
        pulseAnimation: object.pulseAnimation ?? true,
      }));
    }
  }

  if (scene.autoAdvance?.enabled && scene.autoAdvance.nextSceneId) {
    const hasEquivalentTransition = timeline.some((step) =>
      step.blockType === 'transition'
      && (step.data as { targetSceneId?: string | null }).targetSceneId === scene.autoAdvance?.nextSceneId
    );
    if (!hasEquivalentTransition) {
      timeline.push(createTransitionStep({
        targetSceneId: scene.autoAdvance.nextSceneId,
        transitionType: 'fade',
        duration: Math.max(0, scene.autoAdvance.delay || 0),
      }));
    }
  }

  return normalizeEditorTimeline(timeline);
}

function legacySceneToSceneRecordDraft(storyId: string, scene: StoryScene): SceneRecord {
  const timeline = buildLegacySceneTimeline(scene);
  const characters = (scene.characters || []).map((character, index) => ({
    characterId: character.id,
    spriteId: character.uri || character.id,
    position: normalizeLegacyCharacterPosition(character.position),
    visible: true,
    opacity: 1,
    scale: character.scale ?? 1,
    zIndex: index + 1,
  }));

  return {
    id: scene.id,
    storyId,
    name: scene.id,
    description: '',
    tags: [],
    voiceAudioUri: scene.voiceAudioUri ?? null,
    audioTriggers: scene.audioTriggers ?? [],
    autoAdvance: scene.autoAdvance,
    timeline,
    sceneState: {
      backgroundAssetId: scene.backgroundImageUri ?? null,
      backgroundTransition: 'fade',
      characters,
      activeEffects: [],
      soundEvents: [],
      cameraState: {
        action: 'reset',
        zoomLevel: 1,
        panX: 0,
        panY: 0,
        duration: 0,
        easing: 'linear',
      },
      interactiveObjects: scene.interactiveObjects ?? [],
      musicTrackId: scene.musicUri ?? null,
      musicPlaying: !!scene.musicUri,
      musicMode: scene.musicUri ? 'track' : null,
      musicVolume: 1,
      musicLoop: true,
      musicFadeIn: 0,
      musicFadeOut: 0,
      musicBoundTo: 'continuous',
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: mapLegacyChoicesToConnections(scene.choices),
    isStart: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function resolveCanonicalStartSceneId(
  snapshot: CanonicalSceneOperationsSnapshot,
  storyId: string,
  preferredStartSceneId?: string | null
): string {
  const storyRecords = snapshot.sceneRecordsByStory[storyId] || {};

  if (preferredStartSceneId && storyRecords[preferredStartSceneId]) {
    return preferredStartSceneId;
  }

  const metadataStartSceneId = snapshot.storiesMetadata.find((item) => item.id === storyId)?.startSceneId;
  if (metadataStartSceneId && storyRecords[metadataStartSceneId]) {
    return metadataStartSceneId;
  }

  const currentStartRecord = sortSceneRecords(storyRecords).find((record) => record.isStart);
  if (currentStartRecord) {
    return currentStartRecord.id;
  }

  return sortSceneRecords(storyRecords)[0]?.id || '';
}

export function syncCanonicalStartScene(
  snapshot: CanonicalSceneOperationsSnapshot,
  storyId: string,
  options: {
    sceneRecords?: Record<string, SceneRecord>;
    preferredStartSceneId?: string | null;
  } = {}
): CanonicalSceneOperationsSnapshot {
  const storyRecords = options.sceneRecords ?? snapshot.sceneRecordsByStory[storyId] ?? {};
  const startSceneId = resolveCanonicalStartSceneId(
    {
      storiesMetadata: snapshot.storiesMetadata,
      sceneRecordsByStory: {
        ...snapshot.sceneRecordsByStory,
        [storyId]: storyRecords,
      },
    },
    storyId,
    options.preferredStartSceneId
  );

  const synchronizedRecords = Object.fromEntries(
    Object.entries(storyRecords).map(([sceneId, record]) => [
      sceneId,
      {
        ...record,
        isStart: startSceneId !== '' && sceneId === startSceneId,
      },
    ])
  );

  return {
    ...snapshot,
    sceneRecordsByStory: {
      ...snapshot.sceneRecordsByStory,
      [storyId]: synchronizedRecords,
    },
    storiesMetadata: snapshot.storiesMetadata.map((metadata) =>
      metadata.id === storyId
        ? {
            ...metadata,
            startSceneId,
            sceneCount: Object.keys(synchronizedRecords).length,
            sceneOrder: [
              ...(metadata.sceneOrder || []).filter((sceneId) => synchronizedRecords[sceneId]),
              ...Object.keys(synchronizedRecords).filter((sceneId) => !(metadata.sceneOrder || []).includes(sceneId)),
            ],
            updatedAt: Date.now(),
          }
        : metadata
    ),
  };
}

export function buildCanonicalSceneRecordsFromLegacyScenes(
  storyId: string,
  legacyScenes: Record<string, StoryScene>,
  preferredStartSceneId?: string
): Record<string, SceneRecord> {
  const sceneRecords = Object.fromEntries(
    Object.values(legacyScenes).map((scene) => [scene.id, legacySceneToSceneRecordDraft(storyId, scene)])
  );

  return syncCanonicalStartScene(
    {
      storiesMetadata: [
        {
          id: storyId,
          title: '',
          startSceneId: preferredStartSceneId || '',
          createdAt: 0,
          updatedAt: 0,
          sceneCount: Object.keys(sceneRecords).length,
          sceneOrder: Object.keys(sceneRecords),
        },
      ],
      sceneRecordsByStory: {
        [storyId]: sceneRecords,
      },
    },
    storyId,
    {
      sceneRecords,
      preferredStartSceneId,
    }
  ).sceneRecordsByStory[storyId] || {};
}

export function upsertCanonicalSceneFromLegacyScene(
  snapshot: CanonicalSceneOperationsSnapshot,
  storyId: string,
  scene: StoryScene
): CanonicalSceneOperationsSnapshot {
  const storyRecords = { ...(snapshot.sceneRecordsByStory[storyId] || {}) };
  const existingRecord = storyRecords[scene.id];
  const draft = legacySceneToSceneRecordDraft(storyId, scene);
  const timestamp = Date.now();

  storyRecords[scene.id] = existingRecord
    ? {
        ...existingRecord,
        name: existingRecord.name || draft.name,
        timeline: normalizeEditorTimeline(draft.timeline),
        voiceAudioUri: draft.voiceAudioUri,
        audioTriggers: draft.audioTriggers,
        autoAdvance: draft.autoAdvance,
        sceneState: {
          ...existingRecord.sceneState,
          ...draft.sceneState,
        },
        connections: draft.connections,
        updatedAt: timestamp,
      }
    : {
        ...draft,
        timeline: normalizeEditorTimeline(draft.timeline),
        isStart: Object.keys(storyRecords).length === 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

  return syncCanonicalStartScene(snapshot, storyId, {
    sceneRecords: storyRecords,
    preferredStartSceneId: storyRecords[scene.id].isStart ? scene.id : undefined,
  });
}

export function createCanonicalStorySeed(
  title: string,
  options: {
    storyId: string;
    sceneId: string;
    now?: number;
  }
): CanonicalStorySeed {
  const timestamp = options.now ?? Date.now();
  const baseSceneRecord = legacySceneToSceneRecordDraft(options.storyId, {
    id: options.sceneId,
    text: '',
    characters: [],
    choices: [],
    musicUri: null,
  });
  const sceneRecord = {
    ...baseSceneRecord,
    timeline: normalizeEditorTimeline(baseSceneRecord.timeline),
    createdAt: timestamp,
    updatedAt: timestamp,
    isStart: true,
  };

  return {
    metadata: {
      id: options.storyId,
      title,
      description: '',
      author: '',
      startSceneId: options.sceneId,
      createdAt: timestamp,
      updatedAt: timestamp,
      sceneCount: 1,
      sceneOrder: [options.sceneId],
    },
    sceneRecord,
  };
}

export function applyCanonicalSceneDelete(
  snapshot: CanonicalSceneOperationsSnapshot,
  storyId: string,
  sceneId: string
): CanonicalSceneOperationsSnapshot {
  const storyRecords = { ...(snapshot.sceneRecordsByStory[storyId] || {}) };
  if (!storyRecords[sceneId]) {
    return snapshot;
  }

  delete storyRecords[sceneId];

  const cleanedRecords = Object.fromEntries(
    Object.entries(storyRecords).map(([recordId, record]) => [
      recordId,
      {
        ...record,
        connections: (record.connections || []).filter((connection) => connection.targetSceneId !== sceneId),
        timeline: record.timeline.map((step) => step.blockType === 'choice'
          ? {
              ...step,
              data: {
                ...(step.data as ChoiceBlockData),
                options: (step.data as ChoiceBlockData).options.map((option) =>
                  option.targetSceneId === sceneId ? { ...option, targetSceneId: null } : option
                ),
              },
            }
          : step),
      },
    ])
  );

  return syncCanonicalStartScene(snapshot, storyId, {
    sceneRecords: cleanedRecords,
  });
}

export function removeCanonicalConnection(
  snapshot: CanonicalSceneOperationsSnapshot,
  storyId: string,
  fromSceneId: string,
  targetSceneId: string,
  outputPort?: string
): CanonicalSceneOperationsSnapshot {
  const storyRecords = { ...(snapshot.sceneRecordsByStory[storyId] || {}) };
  const fromScene = storyRecords[fromSceneId];
  if (!fromScene) {
    return snapshot;
  }

  storyRecords[fromSceneId] = {
    ...fromScene,
    connections: (fromScene.connections || []).filter((connection) => {
      if (connection.targetSceneId !== targetSceneId) {
        return true;
      }

      if (outputPort === undefined) {
        return false;
      }

      return connection.outputPort !== outputPort;
    }),
    updatedAt: Date.now(),
  };

  return {
    ...snapshot,
    sceneRecordsByStory: {
      ...snapshot.sceneRecordsByStory,
      [storyId]: storyRecords,
    },
    storiesMetadata: snapshot.storiesMetadata.map((metadata) =>
      metadata.id === storyId ? { ...metadata, updatedAt: Date.now() } : metadata
    ),
  };
}

export function replaceConnectionByOutputPort(
  connections: SceneConnection[] = [],
  connection: SceneConnection,
): SceneConnection[] {
  return [
    ...connections.filter((item) => item.outputPort !== connection.outputPort),
    connection,
  ];
}
