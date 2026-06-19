import {
  createBackgroundStep,
  createCameraStep,
  createCharacterStep,
  createChoiceStep,
  createDialogueEntry,
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
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import type { PlateDocumentScene } from '@/components/editor/plate/types';
import { sceneRecordToPlateDocument } from '@/components/editor/plate/serializers/scene-to-plate';
import { plateDocumentToSceneRecord } from '@/components/editor/plate/serializers/plate-to-scene';

function sceneWithTimeline(timeline: TimelineStep[]): SceneRecord {
  return {
    id: 'scene_roundtrip',
    storyId: 'story_roundtrip',
    name: 'Roundtrip',
    description: 'metadata must survive',
    tags: ['plate', 'serializer'],
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
    flowX: 42,
    flowY: 84,
    connections: [{ targetSceneId: 'old_scene', outputPort: 'old', label: 'Old' }],
    isStart: true,
    createdAt: 10,
    updatedAt: 20,
  };
}

function withStepMeta(step: TimelineStep, id: string): TimelineStep {
  return {
    ...step,
    id,
    collapsed: true,
    enabled: false,
    conditions: [{ variableName: 'has_key', operator: '==', value: true }],
  };
}

function cloneThroughPlateBridge(scene: PlateDocumentScene): PlateDocumentScene {
  return JSON.parse(JSON.stringify(scene)) as PlateDocumentScene;
}

function roundtrip(record: SceneRecord): SceneRecord {
  const plateDocument = sceneRecordToPlateDocument(record, []);
  const normalized = normalizePlateDocumentScene(cloneThroughPlateBridge(plateDocument), []);
  return plateDocumentToSceneRecord(record, normalized.scene, []);
}

describe('Plate scene serializer roundtrip', () => {
  it('preserves background technical payload through the current Plate bridge', () => {
    const backgroundStep = withStepMeta(
      createBackgroundStep({
        assetId: 'bg_forest',
        transition: 'dissolve',
        duration: 1000,
      }),
      'step_background',
    );

    const saved = roundtrip(sceneWithTimeline([backgroundStep]));
    const savedStep = saved.timeline[0];

    expect(savedStep.id).toBe('step_background');
    expect(savedStep.blockType).toBe('background');
    expect(savedStep.data).toMatchObject({
      assetId: 'bg_forest',
      transition: 'dissolve',
      duration: 1000,
    });
    expect(savedStep.conditions).toEqual(backgroundStep.conditions);
    expect(savedStep.enabled).toBe(false);
    expect(saved.timeline).toHaveLength(1);
  });

  it('keeps metadata while replacing only document-owned scene fields', () => {
    const record = sceneWithTimeline([withStepMeta(createTextStep({ content: 'Original' }), 'step_text')]);
    const plateDocument = sceneRecordToPlateDocument(record, []);
    plateDocument.sceneName = 'Edited';

    const saved = plateDocumentToSceneRecord(record, cloneThroughPlateBridge(plateDocument), [], {
      nextSceneId: 'scene_next',
    });

    expect(saved.name).toBe('Edited');
    expect(saved.description).toBe('metadata must survive');
    expect(saved.tags).toEqual(['plate', 'serializer']);
    expect(saved.flowX).toBe(42);
    expect(saved.flowY).toBe(84);
    expect(saved.createdAt).toBe(10);
    expect(saved.updatedAt).not.toBe(20);
    expect(saved.connections).toEqual([{ targetSceneId: 'scene_next', outputPort: 'next', label: 'Next' }]);
  });

  it('preserves all technical TimelineStep payloads and conditions', () => {
    const steps = [
      withStepMeta(createCharacterStep({
        characterId: 'char_alice',
        spriteId: 'sprite_smile',
        position: 'far-right',
        transition: 'slide-left',
        delay: 0.25,
        duration: 3,
      }), 'step_character'),
      withStepMeta(createMusicStep({
        assetId: 'music_theme',
        action: 'fade',
        volume: 0.4,
        loop: false,
        fadeDuration: 1500,
      }), 'step_music'),
      withStepMeta(createSoundStep({
        assetId: 'sfx_door',
        action: 'play',
        volume: 0.7,
        loop: true,
        pitchVariation: 0.2,
      }), 'step_sound'),
      withStepMeta(createEffectStep({
        effectType: 'flash',
        target: 'background',
        intensity: 80,
        duration: 1.25,
      }), 'step_effect'),
      withStepMeta(createCameraStep({
        action: 'pan',
        panX: 20,
        panY: 60,
        duration: 2,
        easing: 'ease-out',
      }), 'step_camera'),
      withStepMeta(createVariableStep({
        variableName: 'score',
        operation: 'add',
        value: 5,
      }), 'step_variable'),
      withStepMeta(createInteractiveObjectStep({
        objectId: 'obj_book',
        name: 'Book',
        assetId: 'asset_book',
        position: { x: 12, y: 20, width: 16, height: 18 },
        oneTimeOnly: true,
        pulseAnimation: false,
      }), 'step_interactive'),
      withStepMeta(createTransitionStep({
        targetSceneId: 'scene_after',
        transitionType: 'slide-right',
        duration: 1.5,
      }), 'step_transition'),
    ];

    const saved = roundtrip(sceneWithTimeline(steps));

    expect(saved.timeline).toHaveLength(steps.length);
    steps.forEach((step, index) => {
      expect(saved.timeline[index]).toEqual(step);
    });
  });

  it('preserves dialogue entries and choice option data from source TimelineStep', () => {
    const dialogueStep = withStepMeta(createDialogueStep({
      entries: [
        createDialogueEntry({
          id: 'entry_1',
          characterId: 'char_alice',
          spriteId: 'sprite_neutral',
          text: 'First line',
        }),
        createDialogueEntry({
          id: 'entry_2',
          characterId: 'char_bob',
          spriteId: 'sprite_angry',
          text: 'Second line',
        }),
      ],
      currentEntryIndex: 1,
    }), 'step_dialogue');

    const choiceStep = withStepMeta(createChoiceStep({
      options: [
        {
          id: 'choice_left',
          text: 'Left',
          targetSceneId: 'scene_left',
          condition: { variableName: 'has_map', operator: '==', value: true },
        },
        {
          id: 'choice_right',
          text: 'Right',
          targetSceneId: 'scene_right',
        },
      ],
    }), 'step_choice');

    const saved = roundtrip(sceneWithTimeline([dialogueStep, choiceStep]));

    expect(saved.timeline).toHaveLength(2);
    expect(saved.timeline[0]).toEqual(dialogueStep);
    expect(saved.timeline[1]).toEqual(choiceStep);
  });

  it('normalizes a technical block without a step into a default placeholder step', () => {
    const plateDocument: PlateDocumentScene = {
      sceneId: 'scene_missing_step',
      sceneName: 'Missing Step',
      blocks: [
        {
          id: 'doc_missing_music',
          kind: 'technical',
          commandId: 'music',
          blockType: 'music',
          label: 'Music',
          summary: '',
          step: null as unknown as TimelineStep,
        },
      ],
    };

    const normalized = normalizePlateDocumentScene(cloneThroughPlateBridge(plateDocument), []);
    const technical = normalized.scene.blocks[0];

    expect(technical.kind).toBe('technical');
    if (technical.kind !== 'technical') return;
    expect(technical.id).toBe('doc_missing_music');
    expect(technical.commandId).toBe('music');
    expect(technical.blockType).toBe('music');
    expect(technical.step.blockType).toBe('music');
  });

  it('renders technical block bridge attributes and create-next-scene action in embedded HTML', () => {
    const backgroundStep = withStepMeta(
      createBackgroundStep({
        assetId: 'bg_forest',
        transition: 'dissolve',
        duration: 1000,
      }),
      'step_background',
    );
    const scene = sceneRecordToPlateDocument(sceneWithTimeline([backgroundStep]), []);

    const html = createVNPlateEditorHtml({
      editorId: 'editor_roundtrip',
      scene,
      characters: [],
      isPhone: false,
    });

    expect(html).toContain('data-kind="technical"');
    expect(html).toContain('data-id="step_background"');
    expect(html).toContain('data-command="background"');
    expect(html).toContain('"id":"newScene"');
    expect(html).toContain("type: 'createNextScene'");
  });
});
