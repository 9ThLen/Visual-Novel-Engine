import { describe, expect, it } from 'vitest';

import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryScene } from '@/lib/types';
import {
  sceneRecordToStoryScene,
  storySceneToSceneRecordDraft,
} from '@/lib/scene-record-adapter';

function makeTimelineStep(overrides: Partial<TimelineStep> = {}): TimelineStep {
  return {
    id: 'step-1',
    blockType: 'text',
    data: {
      content: 'Narration line',
      typewriterSpeed: 0.5,
      anchorTo: 'background',
    },
    collapsed: false,
    enabled: true,
    ...overrides,
  };
}

function makeSceneRecord(overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Opening Scene',
    description: '',
    tags: [],
    timeline: [makeTimelineStep()],
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
    flowX: 120,
    flowY: 240,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('scene-record-adapter', () => {
  it('converts canonical media and audio blocks into a compatibility story scene', () => {
    const sceneRecord = makeSceneRecord({
      timeline: [
        makeTimelineStep({
          id: 'bg-1',
          blockType: 'background',
          data: {
            assetId: 'bg-asset',
            transition: 'fade',
            duration: 300,
          },
        }),
        makeTimelineStep({
          id: 'music-1',
          blockType: 'music',
          data: {
            assetId: 'music-asset',
            action: 'play',
            volume: 0.6,
            loop: true,
            fadeDuration: 800,
          },
        }),
        makeTimelineStep({
          id: 'sfx-1',
          blockType: 'sound',
          data: {
            assetId: 'sfx-asset',
            action: 'play',
            volume: 0.4,
            loop: false,
            pitchVariation: 0,
          },
        }),
        makeTimelineStep(),
      ],
    });

    const storyScene = sceneRecordToStoryScene(sceneRecord);

    expect(storyScene).toMatchObject({
      id: 'scene-1',
      text: 'Narration line',
      backgroundImageUri: 'bg-asset',
      musicUri: 'music-asset',
      choices: [],
    });
    expect(storyScene.audioTriggers).toEqual([
      expect.objectContaining({
        id: 'sfx-1',
        audioId: 'sfx-asset',
        triggerType: 'scene_start',
        volume: 0.4,
        loop: false,
      }),
    ]);
  });

  it('creates a canonical scene record draft from a legacy story scene', () => {
    const legacyScene: StoryScene = {
      id: 'legacy-scene',
      text: 'Legacy intro',
      backgroundImageUri: 'legacy-bg',
      characters: [],
      choices: [{ id: 'choice-1', text: 'Continue', nextSceneId: 'scene-2' }],
      musicUri: 'legacy-music',
    };

    const sceneRecord = storySceneToSceneRecordDraft('story-1', legacyScene);

    expect(sceneRecord.storyId).toBe('story-1');
    expect(sceneRecord.id).toBe('legacy-scene');
    expect(sceneRecord.name).toBe('legacy-scene');
    expect(sceneRecord.timeline.some((step) => step.blockType === 'text')).toBe(true);
    expect(sceneRecord.connections).toEqual([
      expect.objectContaining({
        targetSceneId: 'scene-2',
      }),
    ]);
    expect(sceneRecord.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockType: 'background',
          data: expect.objectContaining({ assetId: 'legacy-bg' }),
        }),
        expect.objectContaining({
          blockType: 'music',
          data: expect.objectContaining({ assetId: 'legacy-music', action: 'play' }),
        }),
      ])
    );
  });
});
