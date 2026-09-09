import {
  buildReaderRuntimeSnapshotFromCache,
  buildReaderSceneCache,
  getReaderSceneRecordForNavigation,
  getScenePrefetchSceneIds,
  getTimelinePrefetchSceneIds,
} from '@/lib/reader-scene-cache';
import { createInMemorySceneAccess } from '@/lib/scene-access';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

function transitionStep(targetSceneId: string | null, enabled = true): TimelineStep {
  return {
    id: `transition-${targetSceneId ?? 'end'}`,
    blockType: 'transition',
    data: { mode: targetSceneId ? 'scene' : 'end', targetSceneId, transitionType: 'fade', duration: 0.4 },
    collapsed: false,
    enabled,
  };
}

function choiceStep(...targetSceneIds: (string | null)[]): TimelineStep {
  return {
    id: 'choice',
    blockType: 'choice',
    data: {
      options: targetSceneIds.map((targetSceneId, index) => ({
        id: `choice-${index}`,
        text: `Choice ${index}`,
        targetSceneId,
      })),
    },
    collapsed: false,
    enabled: true,
  };
}

function scene(
  id: string,
  options: Partial<Pick<SceneRecord, 'connections' | 'timeline' | 'createdAt'>> = {},
): SceneRecord {
  const createdAt = options.createdAt ?? 1;
  return {
    id,
    storyId: 'story-1',
    name: id,
    description: '',
    tags: [],
    timeline: options.timeline ?? [],
    sceneState: {
      backgroundAssetId: null,
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      musicTrackId: null,
      musicPlaying: false,
      musicVolume: 1,
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: options.connections ?? [],
    isStart: id === 'scene-1',
    createdAt,
    updatedAt: createdAt,
  };
}

const snapshot = {
  storiesMetadata: [
    {
      id: 'story-1',
      title: 'Story',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 4,
    },
  ],
  sceneRecordsByStory: {
    'story-1': {
      'scene-1': scene('scene-1', {
        connections: [{ targetSceneId: 'scene-2', outputPort: 'next', label: 'Next' }],
        timeline: [choiceStep('scene-3', null, 'scene-2'), transitionStep('scene-4')],
      }),
      'scene-2': scene('scene-2'),
      'scene-3': scene('scene-3'),
      'scene-4': scene('scene-4'),
    },
  },
};

describe('reader scene cache', () => {
  it('extracts prefetch targets from enabled transition and choice steps', () => {
    expect(getTimelinePrefetchSceneIds([
      transitionStep('scene-2'),
      transitionStep('disabled-scene', false),
      choiceStep('scene-3', null, 'scene-2'),
    ])).toEqual(['scene-2', 'scene-3']);
  });

  it('combines connection and timeline targets without duplicates', () => {
    expect(getScenePrefetchSceneIds(snapshot.sceneRecordsByStory['story-1']['scene-1'])).toEqual([
      'scene-2',
      'scene-3',
      'scene-4',
    ]);
  });

  it('builds a bounded cache for the current scene and direct prefetch targets', () => {
    const cache = buildReaderSceneCache(
      createInMemorySceneAccess(snapshot),
      'story-1',
      'scene-1',
      { maxPrefetchScenes: 2 },
    );

    expect(cache.cachedSceneIds).toEqual(['scene-1', 'scene-2', 'scene-3']);
    expect(cache.hasSceneRecord('scene-4')).toBe(false);
    expect(cache.getSceneRecord('scene-2')?.id).toBe('scene-2');
  });

  it('builds a runtime snapshot from cached scene records', () => {
    const access = createInMemorySceneAccess(snapshot);
    const cache = buildReaderSceneCache(access, 'story-1', 'scene-1');
    const runtimeSnapshot = buildReaderRuntimeSnapshotFromCache(access, cache);

    expect(runtimeSnapshot.storiesMetadata.map((story) => story.id)).toEqual(['story-1']);
    expect(Object.keys(runtimeSnapshot.sceneRecordsByStory['story-1'])).toEqual([
      'scene-1',
      'scene-2',
      'scene-3',
      'scene-4',
    ]);
  });

  it('resolves navigation targets from the reader scene cache when prefetched', () => {
    const access = createInMemorySceneAccess(snapshot);

    expect(getReaderSceneRecordForNavigation(access, 'story-1', 'scene-1', 'scene-2')?.id).toBe('scene-2');
  });

  it('falls back to scene access when a navigation target is outside the bounded cache', () => {
    const access = createInMemorySceneAccess(snapshot);

    expect(getReaderSceneRecordForNavigation(
      access,
      'story-1',
      'scene-1',
      'scene-4',
      { maxPrefetchScenes: 1 },
    )?.id).toBe('scene-4');
  });

  it('returns undefined for missing navigation targets', () => {
    const access = createInMemorySceneAccess(snapshot);

    expect(getReaderSceneRecordForNavigation(access, 'story-1', 'scene-1', 'missing-scene')).toBeUndefined();
  });
});
