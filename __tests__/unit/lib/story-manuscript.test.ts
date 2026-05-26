import { describe, expect, it } from 'vitest';

import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { buildStoryManuscript, createEmptyStoryManuscriptBlock } from '@/lib/editor/story-manuscript';

function makeStoryMetadata(overrides: Partial<StoryMetadata> = {}): StoryMetadata {
  return {
    id: 'story-1',
    title: 'Manuscript Story',
    startSceneId: 'scene-1',
    createdAt: 1,
    updatedAt: 1,
    sceneCount: 2,
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
    timeline: [],
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
    isStart: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('story-manuscript', () => {
  it('builds ordered manuscript scenes and blocks from canonical scene records', () => {
    const metadata = makeStoryMetadata();
    const scenes = [
      makeSceneRecord({
        id: 'scene-1',
        name: 'Opening Scene',
        createdAt: 2,
        timeline: [
          {
            id: 'bg-1',
            blockType: 'background',
            data: { assetId: null, transition: 'fade', duration: 500 },
            collapsed: false,
            enabled: true,
          },
          {
            id: 'text-1',
            blockType: 'text',
            data: { content: 'Opening line', typewriterSpeed: 0.5, anchorTo: 'background' },
            collapsed: false,
            enabled: true,
          },
          {
            id: 'dialogue-1',
            blockType: 'dialogue',
            data: {
              entries: [{ id: 'entry-1', characterId: 'hero', spriteId: 'idle', text: 'Hello there' }],
              currentEntryIndex: 0,
            },
            collapsed: false,
            enabled: true,
          },
        ],
      }),
      makeSceneRecord({
        id: 'scene-2',
        name: 'Choice Scene',
        createdAt: 3,
        timeline: [
          {
            id: 'choice-1',
            blockType: 'choice',
            data: {
              options: [
                { id: 'opt-1', text: 'Go left', targetSceneId: 'scene-3' },
                { id: 'opt-2', text: 'Go right', targetSceneId: 'scene-4' },
              ],
            },
            collapsed: false,
            enabled: true,
          },
        ],
      }),
    ];

    const manuscript = buildStoryManuscript(metadata, scenes);

    expect(manuscript.storyId).toBe('story-1');
    expect(manuscript.title).toBe('Manuscript Story');
    expect(manuscript.scenes.map((scene) => scene.sceneId)).toEqual(['scene-1', 'scene-2']);
    expect(manuscript.scenes[0]?.blocks.map((block) => block.kind)).toEqual([
      'technical_marker',
      'narration',
      'dialogue',
    ]);
    expect(manuscript.scenes[0]?.blocks[1]).toMatchObject({
      id: 'text-1',
      kind: 'narration',
      content: 'Opening line',
    });
    expect(manuscript.scenes[1]?.blocks[0]).toMatchObject({
      id: 'choice-1',
      kind: 'choice_group',
    });
  });

  it('creates empty editable manuscript blocks for supported prose kinds', () => {
    expect(createEmptyStoryManuscriptBlock('narration')).toMatchObject({
      kind: 'narration',
      stepBlockType: 'text',
      content: '',
    });
    expect(createEmptyStoryManuscriptBlock('dialogue')).toMatchObject({
      kind: 'dialogue',
      stepBlockType: 'dialogue',
    });
    expect(createEmptyStoryManuscriptBlock('choice_group')).toMatchObject({
      kind: 'choice_group',
      stepBlockType: 'choice',
    });
  });
});
