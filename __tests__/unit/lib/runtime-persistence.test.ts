import { describe, expect, it } from 'vitest';

import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  buildRuntimeLoadSnapshot,
  buildRuntimeSaveSlot,
  type RuntimeStoryStateSnapshot,
} from '@/lib/runtime-story';
import type { PlaybackState, SaveSlot, StoryScene } from '@/lib/types';

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

function makeBackgroundStep(assetId: string): TimelineStep {
  return {
    id: 'bg-1',
    blockType: 'background',
    data: {
      assetId,
      transition: 'fade',
      duration: 500,
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
    timeline: [makeBackgroundStep('bg-canonical'), makeTimelineStep('step-1', 'Canonical line')],
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
  choicesMade: [{ sceneId: 'scene-0', choiceId: 'choice-a' }],
};

const legacyScene: StoryScene = {
  id: 'scene-1',
  text: 'Legacy line',
  backgroundImageUri: 'bg-legacy',
  characters: [],
  choices: [],
  musicUri: null,
};

const runtimeSnapshot: RuntimeStoryStateSnapshot = {
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
  scenesByStory: {
    'story-1': {
      'scene-1': legacyScene,
    },
  },
  sceneRecordsByStory: {
    'story-1': {
      'scene-1': makeSceneRecord(),
    },
  },
};

describe('runtime persistence', () => {
  it('builds save slot previews from canonical runtime scenes when they exist', () => {
    const slot = buildRuntimeSaveSlot('slot-1', runtimeSnapshot, playbackState);

    expect(slot?.sceneText).toBe('Canonical line');
    expect(slot?.thumbnailUri).toBe('bg-canonical');
    expect(slot?.storyTitle).toBe('Story');
  });

  it('loads a canonical-first runtime story snapshot without dropping persisted scene data', () => {
    const slot: SaveSlot = {
      id: 'slot-1',
      storyId: 'story-1',
      sceneId: 'scene-1',
      choicesMade: playbackState.choicesMade,
      timestamp: 1,
    };

    const loaded = buildRuntimeLoadSnapshot(runtimeSnapshot, slot);

    expect(loaded?.story.scenes['scene-1']?.text).toBe('Canonical line');
    expect(loaded?.playbackState.currentSceneId).toBe('scene-1');
    expect(loaded?.playbackState.choicesMade).toEqual(playbackState.choicesMade);
  });
});
