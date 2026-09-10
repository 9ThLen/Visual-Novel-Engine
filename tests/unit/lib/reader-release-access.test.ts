import {
  createInMemorySceneAccess,
  createReaderSceneAccess,
  getReaderSceneRecord,
  getReaderSceneRecordMap,
  isReadingRelease,
  type SceneAccessSnapshot,
} from '@/lib/scene-access';
import type { SceneRecord } from '@/lib/engine/types';

function scene(id: string, name: string): SceneRecord {
  return { id, name, timeline: [], createdAt: 1 } as unknown as SceneRecord;
}

/** The author's copy says "draft"; the release says "published". */
function snapshot(withRelease: boolean): SceneAccessSnapshot {
  return {
    storiesMetadata: [
      { id: 'story_1', title: 'A Novel', startSceneId: 'start', createdAt: 1, updatedAt: 2, sceneCount: 2 },
    ],
    sceneRecordsByStory: {
      story_1: { start: scene('start', 'draft start'), extra: scene('extra', 'draft only') },
    },
    readerRelease: withRelease
      ? {
          storyId: 'story_1',
          releaseId: 'release_1',
          version: '1.0.0',
          startSceneId: 'start',
          scenes: { start: scene('start', 'published start') },
        }
      : null,
  };
}

describe('getReaderSceneRecordMap', () => {
  it('serves the working copy when no release is open', () => {
    const map = getReaderSceneRecordMap(snapshot(false), 'story_1');
    expect(map.start.name).toBe('draft start');
    expect(map.extra).toBeDefined();
  });

  it('serves the frozen release when one is open', () => {
    const map = getReaderSceneRecordMap(snapshot(true), 'story_1');
    expect(map.start.name).toBe('published start');
    // A scene the author added after publishing is not in the release, and the
    // reader must not fall through to it.
    expect(map.extra).toBeUndefined();
  });

  it('leaves other stories on their working copy', () => {
    const state = snapshot(true);
    state.sceneRecordsByStory.story_2 = { only: scene('only', 'other draft') };
    expect(getReaderSceneRecordMap(state, 'story_2').only.name).toBe('other draft');
  });

  it('reports which story is being read from a release', () => {
    expect(isReadingRelease(snapshot(true), 'story_1')).toBe(true);
    expect(isReadingRelease(snapshot(true), 'story_2')).toBe(false);
    expect(isReadingRelease(snapshot(false), 'story_1')).toBe(false);
  });
});

describe('getReaderSceneRecord', () => {
  it('reads one scene out of the release', () => {
    expect(getReaderSceneRecord(snapshot(true), 'story_1', 'start')?.name).toBe('published start');
  });

  it('returns nothing for a scene the release does not contain', () => {
    expect(getReaderSceneRecord(snapshot(true), 'story_1', 'extra')).toBeUndefined();
  });
});

// The editor reads through the shared accessors. If a release could reach them,
// an author would be shown their own frozen copy the moment they left the
// reader -- which is the bug this separation exists to prevent.
describe('the editor is unaffected by an open release', () => {
  it('still sees the working copy', () => {
    const access = createInMemorySceneAccess(snapshot(true));
    expect(access.getSceneRecord('story_1', 'start')?.name).toBe('draft start');
    expect(access.getSceneRecordMapForStory('story_1').extra).toBeDefined();
    expect(access.getSceneRecordsForStory('story_1')).toHaveLength(2);
  });
});

describe('createReaderSceneAccess', () => {
  it('reads scenes from the release but metadata from the store', () => {
    const access = createReaderSceneAccess(snapshot(true));
    expect(access.getSceneRecord('story_1', 'start')?.name).toBe('published start');
    expect(access.getStoryMetadata('story_1')?.title).toBe('A Novel');
    expect(access.getSceneRecordsForStory('story_1')).toHaveLength(1);
  });

  it('behaves exactly like the editor view when no release is open', () => {
    const state = snapshot(false);
    const reader = createReaderSceneAccess(state);
    const editor = createInMemorySceneAccess(state);
    expect(reader.getSceneRecordsForStory('story_1'))
      .toEqual(editor.getSceneRecordsForStory('story_1'));
  });
});
