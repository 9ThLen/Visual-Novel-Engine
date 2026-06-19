import type { SceneRecord } from '@/lib/engine/types';
import { createEmptySceneState } from '@/lib/engine/conditionUtils';
import { getAudioSceneMusicUri, toAudioScene } from '@/lib/audio-scene';

function makeScene(overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Opening',
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

describe('audio-scene projections', () => {
  it('projects canonical scene data into audio scene data', () => {
    const record = makeScene();

    expect(toAudioScene(record)).toEqual({
      id: 'scene-1',
      storyId: 'story-1',
      name: 'Opening',
      timeline: [],
    });
  });

  it('reads the active play music uri from audio scene timeline', () => {
    const scene = toAudioScene(makeScene({
      timeline: [
        {
          id: 'music-1',
          blockType: 'music',
          data: { action: 'play', assetId: 'track-1', volume: 0.8, loop: true, fadeDuration: 0 },
          collapsed: false,
          enabled: true,
        },
      ],
    }));

    expect(getAudioSceneMusicUri(scene)).toBe('track-1');
  });
});
