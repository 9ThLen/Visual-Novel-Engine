import {
  createBackgroundStep,
  createCameraStep,
  createCharacterStep,
  createChoiceStep,
  createDialogueStep,
  createEffectStep,
  createInteractiveObjectStep,
  createMusicStep,
  createSoundStep,
  createTextStep,
  createTransitionStep,
  createVariableStep,
} from '@/lib/engine/event-factory';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  sceneDocumentToSceneRecord,
  sceneRecordToSceneDocument,
} from '@/lib/scene-document/sceneRecordAdapter';

function record(timeline: TimelineStep[]): SceneRecord {
  return {
    id: 'scene_1',
    storyId: 'story_1',
    name: 'Scene',
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

describe('scene document adapter', () => {
  it('roundtrips all engine block types without converting them to text', () => {
    const steps = [
      createBackgroundStep({ assetId: 'bg', transition: 'fade', duration: 500 }),
      createCharacterStep({ characterId: 'char', spriteId: 'smile' }),
      createTextStep({ content: 'Narration' }),
      createDialogueStep(),
      createChoiceStep(),
      createEffectStep({ effectType: 'flash' }),
      createMusicStep({ assetId: 'music' }),
      createSoundStep({ assetId: 'sfx' }),
      createInteractiveObjectStep({ objectId: 'obj' }),
      createCameraStep({ action: 'zoom' }),
      createVariableStep({ variableName: 'flag', operation: 'set', value: true }),
      createTransitionStep({ targetSceneId: 'scene_2' }),
    ];

    const source = record(steps);
    const document = sceneRecordToSceneDocument(source, []);
    const saved = sceneDocumentToSceneRecord(source, document, []);

    expect(saved.timeline.map((step) => step.blockType)).toEqual(steps.map((step) => step.blockType));
    expect(saved.timeline).not.toContainEqual(expect.objectContaining({ blockType: 'text', data: expect.objectContaining({ content: '[character]' }) }));
  });

  it('uses the first transition node for the next connection', () => {
    const source = record([]);
    const saved = sceneDocumentToSceneRecord(source, {
      id: 'scene_1',
      title: 'Scene',
      nodes: [
        { id: 'transition_1', type: 'transition', mode: 'end', targetSceneId: null, transitionType: 'fade', duration: 0.5 },
        { id: 'transition_2', type: 'transition', mode: 'scene', targetSceneId: 'scene_9', transitionType: 'fade', duration: 0.5 },
      ],
    }, [], { nextSceneId: 'scene_2' });

    expect(saved.connections).toEqual([]);
  });
});
