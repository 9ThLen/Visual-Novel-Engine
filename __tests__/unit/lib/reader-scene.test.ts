import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { createEmptySceneState } from '@/lib/engine/conditionUtils';
import { toReaderScene, toSaveSlotMeta } from '@/lib/reader-scene';

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
});
