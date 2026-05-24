import { storySceneToSceneRecordDraft } from '@/lib/scene-record-adapter';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { StoryScene } from '@/lib/types';

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
    Object.values(legacyScenes).map((scene) => [scene.id, storySceneToSceneRecordDraft(storyId, scene)])
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

export function createCanonicalStorySeed(
  title: string,
  options: {
    storyId: string;
    sceneId: string;
    now?: number;
  }
): CanonicalStorySeed {
  const timestamp = options.now ?? Date.now();
  const sceneRecord = {
    ...storySceneToSceneRecordDraft(options.storyId, {
      id: options.sceneId,
      text: 'Your story begins here...',
      characters: [],
      choices: [],
      musicUri: null,
    }),
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
