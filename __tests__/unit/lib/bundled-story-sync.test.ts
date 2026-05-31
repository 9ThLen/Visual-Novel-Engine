import { describe, expect, it } from 'vitest';

import { shouldUpsertBundledStory } from '@/lib/bundled-story-sync';
import type { Story } from '@/lib/scene-operations';

const bundledStory: Story = {
  id: 'demo-story-001',
  title: 'Demo',
  description: '',
  author: '',
  startSceneId: 'scene_1',
  createdAt: 1,
  updatedAt: 1,
  scenes: {
    scene_1: {
      id: 'scene_1',
      text: 'Intro',
      backgroundImageUri: null,
      characters: [],
      choices: [],
      musicUri: 'assets/sounds-sample/music-mysterious-adventure.mp3',
    },
  },
};

describe('shouldUpsertBundledStory', () => {
  it('returns true when bundled story is missing', () => {
    expect(
      shouldUpsertBundledStory(
        {
          storiesMetadata: [],
          scenesByStory: {},
          sceneRecordsByStory: {},
        },
        bundledStory,
      ),
    ).toBe(true);
  });

  it('returns true when persisted canonical start scene lost bundled music', () => {
    expect(
      shouldUpsertBundledStory(
        {
          storiesMetadata: [{ id: bundledStory.id }],
          scenesByStory: {
            [bundledStory.id]: {
              scene_1: {
                musicUri: null,
              },
            },
          },
          sceneRecordsByStory: {
            [bundledStory.id]: {
              scene_1: {
                id: 'scene_1',
                storyId: bundledStory.id,
                name: 'scene_1',
                description: '',
                tags: [],
                timeline: [
                  {
                    id: 'scene_1-text',
                    blockType: 'text',
                    data: { content: 'Intro', typewriterSpeed: 0.5, anchorTo: 'background' },
                    collapsed: false,
                    enabled: true,
                  },
                ],
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
              },
            },
          },
        },
        bundledStory,
      ),
    ).toBe(true);
  });

  it('returns false when canonical start scene matches bundled music', () => {
    expect(
      shouldUpsertBundledStory(
        {
          storiesMetadata: [{ id: bundledStory.id }],
          scenesByStory: {},
          sceneRecordsByStory: {
            [bundledStory.id]: {
              scene_1: {
                id: 'scene_1',
                storyId: bundledStory.id,
                name: 'scene_1',
                description: '',
                tags: [],
                timeline: [
                  {
                    id: 'scene_1-music',
                    blockType: 'music',
                    data: {
                      assetId: 'assets/sounds-sample/music-mysterious-adventure.mp3',
                      action: 'play',
                      volume: 1,
                      loop: true,
                      fadeDuration: 500,
                    },
                    collapsed: false,
                    enabled: true,
                  },
                  {
                    id: 'scene_1-text',
                    blockType: 'text',
                    data: { content: 'Intro', typewriterSpeed: 0.5, anchorTo: 'background' },
                    collapsed: false,
                    enabled: true,
                  },
                ],
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
              },
            },
          },
        },
        bundledStory,
      ),
    ).toBe(false);
  });
});
