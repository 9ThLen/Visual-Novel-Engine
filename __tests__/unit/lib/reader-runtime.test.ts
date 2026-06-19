import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { toReaderScene } from '@/lib/reader-scene';
import {
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
});
