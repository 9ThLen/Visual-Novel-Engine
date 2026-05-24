import { describe, expect, it } from 'vitest';

import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { resolveRuntimeCurrentScene } from '@/lib/runtime-story';
import type { PlaybackState, StoryScene } from '@/lib/types';

function makeTimelineStep(id: string, content: string): TimelineStep {
  return {
    id,
    blockType: 'text',
    data: {
      content,
      typewriterSpeed: 0.5,
      anchorTo: 'background',
    },
    collapsed: false,
    enabled: true,
  };
}

function makeSceneRecord(overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Canonical Scene',
    description: '',
    tags: [],
    timeline: [makeTimelineStep('step-1', 'Canonical line')],
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
    ...overrides,
  };
}

const playbackState: PlaybackState = {
  storyId: 'story-1',
  currentSceneId: 'scene-1',
  isPlaying: true,
  currentDialogueIndex: 0,
  choicesMade: [],
};

const legacyScene: StoryScene = {
  id: 'scene-1',
  text: 'Legacy line',
  backgroundImageUri: null,
  characters: [],
  choices: [],
  musicUri: null,
};

describe('useReaderInitialization canonical scene resolution', () => {
  it('resolves the current reader scene from canonical runtime snapshots before legacy scenes', () => {
    const currentScene = resolveRuntimeCurrentScene(
      {
        scenesByStory: {
          'story-1': { 'scene-1': legacyScene },
        },
        sceneRecordsByStory: {
          'story-1': { 'scene-1': makeSceneRecord() },
        },
      },
      playbackState
    );

    expect(currentScene?.text).toBe('Canonical line');
  });

  it('does not fall back to the legacy scene on the strict production reader path', () => {
    const currentScene = resolveRuntimeCurrentScene(
      {
        scenesByStory: {
          'story-1': { 'scene-1': legacyScene },
        },
        sceneRecordsByStory: {},
      },
      playbackState
    );

    expect(currentScene).toBeNull();
  });
});
