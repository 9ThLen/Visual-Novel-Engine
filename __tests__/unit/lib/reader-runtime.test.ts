import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { toReaderScene } from '@/lib/reader-scene';
import {
  buildCanonicalLoadSnapshot,
  buildCanonicalSaveSlot,
  buildNextPlaybackState,
  getNextSceneId,
  getStartSceneId,
  getTimelineDisplayPages,
  toReaderChoices,
} from '@/lib/reader-runtime';
import { createEmptySceneState } from '@/lib/engine/conditionUtils';

function makeScene(id: string, overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name: id,
    description: '',
    tags: [],
    timeline: [],
    sceneState: createEmptySceneState(),
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('reader-runtime', () => {
  it('resolves metadata start scene before isStart fallback', () => {
    const scenes = {
      a: toReaderScene(makeScene('a', { isStart: true })),
      b: toReaderScene(makeScene('b')),
    };

    expect(getStartSceneId(scenes, 'b')).toBe('b');
    expect(getStartSceneId(scenes, null)).toBe('a');
  });

  it('resolves explicit and next-connection scene targets', () => {
    const scenes = {
      a: toReaderScene(makeScene('a', { connections: [{ outputPort: 'next', targetSceneId: 'b' }] })),
      b: toReaderScene(makeScene('b')),
    };

    expect(getNextSceneId(scenes, 'a', 'b')).toBe('b');
    expect(getNextSceneId(scenes, 'a', null)).toBe('b');
    expect(getNextSceneId(scenes, 'a', 'missing')).toBeNull();
  });

  it('resolves transition modes explicitly', () => {
    const scenes = {
      a: toReaderScene(makeScene('a', { connections: [{ outputPort: 'next', targetSceneId: 'b' }] })),
      b: toReaderScene(makeScene('b')),
    };

    // 'end' ends the story even when a next connection exists
    expect(getNextSceneId(scenes, 'a', null, 'end')).toBeNull();
    expect(getNextSceneId(scenes, 'a', 'b', 'end')).toBeNull();
    // 'scene' without a valid target ends the story instead of falling back
    expect(getNextSceneId(scenes, 'a', null, 'scene')).toBeNull();
    expect(getNextSceneId(scenes, 'a', 'missing', 'scene')).toBeNull();
    expect(getNextSceneId(scenes, 'a', 'b', 'scene')).toBe('b');
    // 'next' follows the connection
    expect(getNextSceneId(scenes, 'a', null, 'next')).toBe('b');
  });

  it('builds typed display pages from text and dialogue steps', () => {
    const textStep: TimelineStep = {
      id: 'text-1',
      blockType: 'text',
      data: { content: 'First\n\nSecond', typewriterSpeed: 0.5, anchorTo: 'background' },
      collapsed: false,
      enabled: true,
    };
    const dialogueStep: TimelineStep = {
      id: 'dialogue-1',
      blockType: 'dialogue',
      data: { currentEntryIndex: 0, entries: [{ id: 'e1', characterId: 'Alice', spriteId: '', text: 'Hello' }] },
      collapsed: false,
      enabled: true,
    };

    expect(getTimelineDisplayPages(textStep)).toEqual(['First', 'Second']);
    expect(getTimelineDisplayPages(dialogueStep)).toEqual(['Alice: Hello']);
  });

  it('maps executor choices to reader choices', () => {
    expect(toReaderChoices([{ id: 'a', text: 'A', targetSceneId: 'scene-a' }])).toEqual([
      { id: 'a', text: 'A', nextSceneId: 'scene-a', targetSceneId: 'scene-a', index: 0 },
    ]);
  });

  it('builds next playback state with carried variables', () => {
    const previous = {
      storyId: 'story-1',
      currentSceneId: 'scene-1',
      isPlaying: true,
      currentDialogueIndex: 3,
      choicesMade: [{ sceneId: 'scene-1', choiceId: 'choice-a' }],
      variables: { flag: true },
    };

    expect(buildNextPlaybackState(
      previous,
      'scene-2',
      [{ sceneId: 'scene-1', choiceId: 'choice-b' }],
      { score: 2, _last_choice: 'choice-b' },
    )).toEqual({
      storyId: 'story-1',
      currentSceneId: 'scene-2',
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: [{ sceneId: 'scene-1', choiceId: 'choice-b' }],
      variables: { score: 2, _last_choice: 'choice-b' },
    });
  });

  it('saves and loads canonical variables while legacy slots load with empty variables', () => {
    const snapshot = {
      storiesMetadata: [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
        },
      ],
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': toReaderScene(makeScene('scene-1')),
        },
      },
    };
    const playbackState = {
      storyId: 'story-1',
      currentSceneId: 'scene-1',
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: [{ sceneId: 'scene-1', choiceId: 'choice-a' }],
      variables: { flag: true, score: 7 },
    };

    const slot = buildCanonicalSaveSlot('slot-1', snapshot, playbackState);
    expect(slot?.variables).toEqual({ flag: true, score: 7 });

    const loaded = slot ? buildCanonicalLoadSnapshot(snapshot, slot) : null;
    expect(loaded?.playbackState.variables).toEqual({ flag: true, score: 7 });

    const legacyLoaded = buildCanonicalLoadSnapshot(snapshot, {
      id: 'legacy',
      storyId: 'story-1',
      sceneId: 'scene-1',
      choicesMade: [],
      timestamp: 1,
    });
    expect(legacyLoaded?.playbackState.variables).toEqual({});
  });
});
