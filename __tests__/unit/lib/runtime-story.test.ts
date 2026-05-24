import { describe, expect, it } from 'vitest';

import type { StoryScene } from '@/lib/types';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  buildRuntimeSceneSnapshot,
  buildRuntimeStorySnapshot,
  buildCompatibilityRuntimeSceneSnapshot,
  resolvePreviewTimeline,
  type RuntimeStoryStateSnapshot,
} from '@/lib/runtime-story';

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

const legacyScene: StoryScene = {
  id: 'scene-1',
  text: 'Legacy line',
  backgroundImageUri: null,
  characters: [],
  choices: [],
  musicUri: null,
};

const baseSnapshot: RuntimeStoryStateSnapshot = {
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

describe('runtime-story', () => {
  it('builds a canonical-first runtime scene snapshot', () => {
    const snapshot = buildRuntimeSceneSnapshot(baseSnapshot, 'story-1', 'scene-1');

    expect(snapshot?.source).toBe('canonical');
    expect(snapshot?.scene.text).toBe('Canonical line');
    expect(snapshot?.timeline).toEqual([makeTimelineStep('step-1', 'Canonical line')]);
  });

  it('does not use legacy scenes on the default runtime path when canonical records are missing', () => {
    const snapshot = buildRuntimeSceneSnapshot(
      {
        ...baseSnapshot,
        sceneRecordsByStory: {},
      },
      'story-1',
      'scene-1'
    );

    expect(snapshot).toBeNull();
  });

  it('keeps legacy scene fallback only behind an explicit compatibility runtime helper', () => {
    const snapshot = buildCompatibilityRuntimeSceneSnapshot(
      {
        ...baseSnapshot,
        sceneRecordsByStory: {},
      },
      'story-1',
      'scene-1'
    );

    expect(snapshot?.source).toBe('legacy');
    expect(snapshot?.scene.text).toBe('Legacy line');
    expect(snapshot?.timeline).toEqual([]);
  });

  it('builds a canonical-first runtime story snapshot', () => {
    const story = buildRuntimeStorySnapshot(baseSnapshot, 'story-1');

    expect(story?.scenes['scene-1']?.text).toBe('Canonical line');
  });

  it('prefers unsaved draft timeline only when explicitly provided for preview', () => {
    const resolved = resolvePreviewTimeline(baseSnapshot, {
      storyId: 'story-1',
      sceneId: 'scene-1',
      draftTimeline: [makeTimelineStep('draft-1', 'Draft line')],
    });

    expect(resolved.source).toBe('draft');
    expect(resolved.timeline).toEqual([makeTimelineStep('draft-1', 'Draft line')]);
  });

  it('uses persisted canonical timeline for preview when no draft override exists', () => {
    const resolved = resolvePreviewTimeline(baseSnapshot, {
      storyId: 'story-1',
      sceneId: 'scene-1',
    });

    expect(resolved.source).toBe('canonical');
    expect(resolved.timeline).toEqual([makeTimelineStep('step-1', 'Canonical line')]);
  });
});
