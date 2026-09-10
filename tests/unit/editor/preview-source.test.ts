import { createBackgroundStep, createTextStep } from '@/lib/engine/event-factory';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { resolvePreviewTimelineFromRecords } from '@/components/editor/preview-source';

function sceneRecord(sceneId: string, timeline: TimelineStep[]): SceneRecord {
  return {
    id: sceneId,
    storyId: 'story_1',
    name: sceneId,
    description: '',
    tags: [],
    timeline,
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
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('preview source timeline', () => {
  it('uses persisted SceneRecord timeline instead of legacy editor draft state', () => {
    const persistedTimeline = [
      { ...createBackgroundStep({ assetId: 'bg_persisted' }), id: 'persisted_bg' },
    ];
    const legacyDirtyTimeline = [
      { ...createTextStep({ content: 'dirty draft should not be previewed' }), id: 'legacy_dirty' },
    ];

    const selected = resolvePreviewTimelineFromRecords(
      {
        story_1: {
          scene_1: sceneRecord('scene_1', persistedTimeline),
        },
      },
      'story_1',
      'scene_1',
    );

    expect(selected).toBe(persistedTimeline);
    expect(selected).not.toBe(legacyDirtyTimeline);
    expect(selected[0]?.id).toBe('persisted_bg');
  });

  it('returns an empty timeline when the persisted scene is missing', () => {
    expect(resolvePreviewTimelineFromRecords({}, 'story_1', 'missing_scene')).toEqual([]);
  });
});
