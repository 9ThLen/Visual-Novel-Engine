import { describe, expect, it } from 'vitest';

import { buildStoriesFromStateSnapshot, buildStoryFromStateSnapshot, type StoryStateSnapshot } from '@/lib/story-state';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

const canonicalTimeline: TimelineStep[] = [
  {
    id: 'step-1',
    blockType: 'text',
    data: {
      content: 'Canonical text',
      typewriterSpeed: 0.5,
      anchorTo: 'background',
    },
    collapsed: false,
    enabled: true,
  },
];

const canonicalRecord: SceneRecord = {
  id: 'scene-1',
  storyId: 'story-1',
  name: 'Canonical Scene',
  description: '',
  tags: [],
  timeline: canonicalTimeline,
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
  createdAt: 10,
  updatedAt: 10,
};

const baseSnapshot: StoryStateSnapshot = {
  storiesMetadata: [
    {
      id: 'story-1',
      title: 'Story One',
      description: 'desc',
      author: 'author',
      startSceneId: 'scene-1',
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 1,
    },
  ],
  scenesByStory: {
    'story-1': {
      'scene-1': {
        id: 'scene-1',
        text: 'Legacy only text',
        characters: [],
        choices: [],
        musicUri: null,
      },
    },
  },
  sceneRecordsByStory: {
    'story-1': {
      'scene-1': canonicalRecord,
    },
  },
};

describe('story-hooks canonical reconstruction', () => {
  it('reconstructs a story from canonical scene records before legacy scenes', () => {
    const story = buildStoryFromStateSnapshot(baseSnapshot, 'story-1');

    expect(story?.scenes['scene-1']?.text).toBe('Canonical text');
    expect(story?.scenes['scene-1']?.text).not.toBe('Legacy only text');
  });

  it('falls back to legacy scenes when canonical scene records are missing', () => {
    const story = buildStoryFromStateSnapshot(
      {
        ...baseSnapshot,
        sceneRecordsByStory: {},
      },
      'story-1'
    );

    expect(story?.scenes['scene-1']?.text).toBe('Legacy only text');
  });

  it('builds the story list from canonical-first reconstruction', () => {
    const stories = buildStoriesFromStateSnapshot(baseSnapshot);

    expect(stories).toHaveLength(1);
    expect(stories[0]?.scenes['scene-1']?.text).toBe('Canonical text');
  });
});
