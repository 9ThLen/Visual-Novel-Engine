import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { createEmptySceneState } from '@/lib/engine/conditionUtils';
import {
  getReaderSceneFromAccess,
  toReaderScene,
  toSaveSlotMeta,
  toStableReaderScene,
} from '@/lib/reader-scene';

function makeScene(overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Opening',
    description: 'Internal editor description',
    tags: ['intro'],
    timeline: [],
    sceneState: createEmptySceneState(),
    flowX: 10,
    flowY: 20,
    connections: [{ targetSceneId: 'scene-2', outputPort: 'next' }],
    isStart: true,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('reader-scene projections', () => {
  it('projects only reader-facing scene fields', () => {
    const record = makeScene({
      voiceAudioUri: 'voice.mp3',
      audioTriggers: [{ id: 'trigger-1', audioId: 'sfx-1', triggerType: 'scene_start' }],
    });

    expect(toReaderScene(record)).toEqual({
      id: 'scene-1',
      storyId: 'story-1',
      name: 'Opening',
      timeline: [],
      voiceAudioUri: 'voice.mp3',
      audioTriggers: [{ id: 'trigger-1', audioId: 'sfx-1', triggerType: 'scene_start' }],
      connections: [{ targetSceneId: 'scene-2', outputPort: 'next' }],
      isStart: true,
    });
  });

  it('builds save slot metadata from reader scene timeline', () => {
    const timeline: TimelineStep[] = [
      {
        id: 'bg-1',
        blockType: 'background',
        data: { assetId: 'asset-bg', transition: 'fade', duration: 1000 },
        collapsed: false,
        enabled: true,
      },
      {
        id: 'text-1',
        blockType: 'text',
        data: { content: 'First line\nSecond line', typewriterSpeed: 0.5, anchorTo: 'background' },
        collapsed: false,
        enabled: true,
      },
    ];
    const scene = toReaderScene(makeScene({ timeline }));

    expect(toSaveSlotMeta(scene)).toEqual({
      sceneName: 'Opening',
      thumbnailUri: 'asset-bg',
      sceneText: 'First line',
    });
  });

  it('does not guess an active video from authoring order', () => {
    const timeline: TimelineStep[] = [
      {
        id: 'bg-1',
        blockType: 'background',
        data: { assetId: 'asset-bg', transition: 'fade', duration: 1000 },
        collapsed: false,
        enabled: true,
      },
      {
        id: 'video-1',
        blockType: 'video',
        data: { mode: 'play', layer: 'background', assetId: 'clip-1', posterAssetId: 'poster-1' },
        collapsed: false,
        enabled: true,
      },
    ];

    expect(toSaveSlotMeta(toReaderScene(makeScene({ timeline }))).thumbnailUri).toBe('asset-bg');
  });

  // Zustand selectors compare snapshots by identity: a fresh projection per
  // call makes useSyncExternalStore report a change on every render, and the
  // reader dies with "Maximum update depth exceeded".
  it('returns the same projection instance for the same stored record', () => {
    const record = makeScene();

    expect(toStableReaderScene(record)).toBe(toStableReaderScene(record));
    expect(toStableReaderScene(makeScene())).not.toBe(toStableReaderScene(record));
  });

  it('projects a stored record into a reader scene without exposing the record', () => {
    const record = makeScene({ timeline: [] });
    const snapshot = { sceneRecordsByStory: { 'story-1': { 'scene-1': record } } };

    const scene = getReaderSceneFromAccess(snapshot, 'story-1', 'scene-1');

    expect(scene).toEqual(toReaderScene(record));
    expect(scene).not.toHaveProperty('sceneState');
    expect(scene).not.toHaveProperty('description');
    expect(getReaderSceneFromAccess(snapshot, 'story-1', 'scene-1')).toBe(scene);
    expect(getReaderSceneFromAccess(snapshot, 'story-1', 'missing')).toBeUndefined();
  });
});
