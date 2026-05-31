import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import {
  applyStoryManuscriptChanges,
  buildStoryManuscript,
  moveStoryManuscriptSceneBlock,
} from '@/lib/editor/story-manuscript';

function makeStoryMetadata(overrides: Partial<StoryMetadata> = {}): StoryMetadata {
  return {
    id: 'story-1',
    title: 'Manuscript Story',
    startSceneId: 'scene-1',
    createdAt: 1,
    updatedAt: 1,
    sceneCount: 1,
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
        id: 'music-1',
        blockType: 'music',
        data: { assetId: 'track-1', action: 'play', volume: 0.8, loop: true, fadeDuration: 1000 },
        collapsed: false,
        enabled: true,
      },
      {
        id: 'choice-1',
        blockType: 'choice',
        data: {
          options: [
            { id: 'opt-1', text: 'Go left', targetSceneId: 'scene-2' },
            { id: 'opt-2', text: 'Go right', targetSceneId: 'scene-3' },
          ],
        },
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
    connections: [{ targetSceneId: 'scene-2', outputPort: 'next' }],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('story-manuscript save', () => {
  it('reorders blocks only inside the selected manuscript scene', () => {
    const metadata = makeStoryMetadata({ sceneCount: 2 });
    const sourceScenes = [
      makeSceneRecord(),
      makeSceneRecord({
        id: 'scene-2',
        name: 'Second Scene',
        createdAt: 2,
        timeline: [
          {
            id: 'text-2',
            blockType: 'text',
            data: { content: 'Scene two', typewriterSpeed: 0.5, anchorTo: 'background' },
            collapsed: false,
            enabled: true,
          },
        ],
      }),
    ];
    const manuscript = buildStoryManuscript(metadata, sourceScenes);

    const reordered = moveStoryManuscriptSceneBlock(manuscript, 'scene-1', 1, 3);

    expect(reordered.scenes[0]?.blocks.map((block) => block.id)).toEqual([
      'bg-1',
      'music-1',
      'choice-1',
      'text-1',
    ]);
    expect(reordered.scenes[1]?.blocks.map((block) => block.id)).toEqual(['text-2']);
  });

  it('applies manuscript edits back to canonical scene records without losing technical blocks', () => {
    const metadata = makeStoryMetadata();
    const sourceScene = makeSceneRecord();
    const manuscript = buildStoryManuscript(metadata, [sourceScene]);
    const sceneSection = manuscript.scenes[0];

    if (!sceneSection) {
      throw new Error('expected scene section');
    }

    const narration = sceneSection.blocks.find((block) => block.kind === 'narration');
    const choices = sceneSection.blocks.find((block) => block.kind === 'choice_group');

    if (!narration || narration.kind !== 'narration' || !choices || choices.kind !== 'choice_group') {
      throw new Error('expected editable manuscript blocks');
    }

    narration.content = 'Edited opening line';
    choices.options[0] = { ...choices.options[0], text: 'Take the hidden path' };
    sceneSection.blocks = [
      sceneSection.blocks[0]!,
      choices,
      sceneSection.blocks[2]!,
      narration,
    ];

    const updatedScenes = applyStoryManuscriptChanges(manuscript, [sourceScene]);
    const updatedScene = updatedScenes[0];

    expect(updatedScene?.name).toBe('Opening Scene');
    expect(updatedScene?.connections).toEqual([{ targetSceneId: 'scene-2', outputPort: 'next' }]);
    expect(updatedScene?.timeline.map((step) => step.id)).toEqual(['bg-1', 'choice-1', 'music-1', 'text-1']);
    expect(updatedScene?.timeline.find((step) => step.id === 'text-1')).toMatchObject({
      data: { content: 'Edited opening line' },
    });
    expect(updatedScene?.timeline.find((step) => step.id === 'choice-1')).toMatchObject({
      data: {
        options: [
          { id: 'opt-1', text: 'Take the hidden path', targetSceneId: 'scene-2' },
          { id: 'opt-2', text: 'Go right', targetSceneId: 'scene-3' },
        ],
      },
    });
    expect(updatedScene?.timeline.find((step) => step.id === 'music-1')?.blockType).toBe('music');
  });

  it('creates new supported prose blocks from manuscript-only entries', () => {
    const metadata = makeStoryMetadata();
    const sourceScene = makeSceneRecord();
    const manuscript = buildStoryManuscript(metadata, [sourceScene]);
    const sceneSection = manuscript.scenes[0];

    if (!sceneSection) {
      throw new Error('expected scene section');
    }

    sceneSection.blocks.push({
      id: 'manuscript-new-text',
      sourceStepId: 'manuscript-new-text',
      stepBlockType: 'text',
      enabled: true,
      collapsed: false,
      kind: 'narration',
      content: 'A newly added paragraph',
    });

    const updatedScene = applyStoryManuscriptChanges(manuscript, [sourceScene])[0];
    const createdBlock = updatedScene?.timeline[updatedScene.timeline.length - 1];

    expect(createdBlock?.blockType).toBe('text');
    expect(createdBlock?.data).toMatchObject({
      content: 'A newly added paragraph',
    });
  });
});
