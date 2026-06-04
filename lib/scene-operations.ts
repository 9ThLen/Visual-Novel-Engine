import { normalizeEditorTimeline } from '@/lib/editor-scene-draft';
import type { SceneConnection, SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { SplashScreenConfig } from '@/lib/splash-types';
import type { InteractiveObject } from '@/lib/interactive-types';
import type { AudioLibraryItem, AudioTrigger } from '@/lib/audio-types';
import type { CharacterSprite } from '@/lib/character-types';

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
  createChoiceStep,
  createMusicStep,
  createTextStep,
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
  return state.sceneRecordsByStory[storyId]?.[sceneId];
}

export function getCanonicalSceneRecordsForStoryFromState(
  state: CanonicalSceneStateSnapshot,
  storyId: string
): SceneRecord[] {
  const storyRecordsById = state.sceneRecordsByStory[storyId] || {};
  const storyRecords = Object.values(storyRecordsById);
  const sceneOrder = state.storiesMetadata?.find((item) => item.id === storyId)?.sceneOrder;
  if (!sceneOrder?.length) {
    return storyRecords.sort((a, b) => a.createdAt - b.createdAt);
  }

  const orderIndex = new Map(sceneOrder.map((sceneId, index) => [sceneId, index]));
  return storyRecords.sort((a, b) => {
    const aIndex = orderIndex.get(a.id);
    const bIndex = orderIndex.get(b.id);
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return a.createdAt - b.createdAt;
  });
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

function legacySceneToSceneRecordDraft(storyId: string, scene: StoryScene): SceneRecord {
  const timeline: TimelineStep[] = [];

  if (scene.backgroundImageUri) {
    timeline.push(createBackgroundStep({ assetId: scene.backgroundImageUri }));
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
    timeline.push(createMusicStep({ assetId: scene.musicUri, action: 'play' }));
  }

  return {
    id: scene.id,
    storyId,
    name: scene.id,
    description: '',
    tags: [],
    timeline: normalizeEditorTimeline(timeline),
    sceneState: {
      backgroundAssetId: scene.backgroundImageUri ?? null,
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      musicTrackId: scene.musicUri ?? null,
      musicPlaying: !!scene.musicUri,
      musicVolume: 1,
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
