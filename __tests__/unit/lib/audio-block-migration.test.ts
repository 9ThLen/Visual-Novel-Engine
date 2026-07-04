import {
  migrateMusicBlockData,
  migrateSceneRecordsByStory,
  migrateSoundBlockData,
} from '@/lib/audio-block-migration';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

function scene(id: string, timeline: TimelineStep[]): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name: id,
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
    isStart: id === 'scene-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('audio block migration', () => {
  it('passes already migrated music and sound blocks through unchanged', () => {
    const music = {
      mode: 'track',
      assetId: 'bgm',
      volume: 0.5,
      loop: true,
      fadeIn: 1.2,
      fadeOut: 0.6,
      boundTo: 'scene',
      autoFadeAfter: 3,
    };
    const sound = {
      mode: 'silence',
      assetId: 'rain',
      volume: 0.8,
      loop: true,
      fadeIn: 0,
      fadeOut: 0.4,
      pitchVariation: 0,
      boundTo: 'continuous',
    };

    expect(migrateMusicBlockData(music)).toBe(music);
    expect(migrateSoundBlockData(sound)).toBe(sound);
  });

  it('maps legacy music actions into explicit track and silence modes', () => {
    expect(
      migrateMusicBlockData({
        action: 'play',
        assetId: 'bgm',
        volume: 1.5,
        loop: 'false',
        fadeDuration: 1500,
      }),
    ).toEqual({
      mode: 'track',
      assetId: 'bgm',
      volume: 1,
      loop: false,
      fadeIn: 1.5,
      fadeOut: 0.8,
      boundTo: 'continuous',
      autoFadeAfter: undefined,
    });

    expect(
      migrateMusicBlockData({
        action: 'fade',
        fadeDuration: 250,
      }),
    ).toMatchObject({
      mode: 'silence',
      fadeIn: 0,
      fadeOut: 0.25,
      boundTo: 'continuous',
    });

    expect(migrateMusicBlockData({ action: 'pause' })).toMatchObject({
      mode: 'silence',
      fadeIn: 0,
      fadeOut: 0.8,
    });
  });

  it('maps legacy sound stop into a named looping silence target', () => {
    expect(
      migrateSoundBlockData({
        action: 'stop',
        assetId: 'rain',
        loop: false,
        fadeDuration: 600,
        pitchVariation: 0.3,
      }),
    ).toEqual({
      mode: 'silence',
      assetId: 'rain',
      volume: 0.8,
      loop: true,
      fadeIn: 0,
      fadeOut: 0.6,
      pitchVariation: 0.3,
      boundTo: 'continuous',
    });
  });

  it('migrates audio blocks inside every scene record by story', () => {
    const legacyTimeline = [
      {
        id: 'music-1',
        sceneId: 'scene-1',
        blockType: 'music',
        order: 0,
        data: { action: 'play', assetId: 'bgm', volume: 0.7, loop: true, fadeDuration: 900 },
      },
      {
        id: 'sound-1',
        sceneId: 'scene-1',
        blockType: 'sound',
        order: 1,
        data: { action: 'stop', assetId: 'rain' },
      },
    ] as unknown as TimelineStep[];

    const migrated = migrateSceneRecordsByStory({
      'story-1': {
        'scene-1': scene('scene-1', legacyTimeline),
      },
    });

    expect(migrated['story-1']['scene-1'].timeline[0].data).toMatchObject({
      mode: 'track',
      assetId: 'bgm',
      fadeIn: 0.9,
      boundTo: 'continuous',
    });
    expect(migrated['story-1']['scene-1'].timeline[1].data).toMatchObject({
      mode: 'silence',
      assetId: 'rain',
      loop: true,
    });
  });
});
