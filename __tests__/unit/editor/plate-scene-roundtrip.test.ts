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
import type { DialogueBlockData } from '@/lib/engine/types';

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

function withId(step: TimelineStep, id: string): TimelineStep {
  return { ...step, id };
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

  it('preserves non-character technical TimelineStep payloads and conditions', () => {
    const steps = [
      withStepMeta(createMusicStep({
        assetId: 'music_theme',
        mode: 'track',
        volume: 0.4,
        loop: false,
        fadeIn: 1.5,
        fadeOut: 0.8,
        boundTo: 'continuous',
      }), 'step_music'),
      withStepMeta(createSoundStep({
        assetId: 'sfx_door',
        mode: 'track',
        volume: 0.7,
        loop: true,
        fadeIn: 0,
        fadeOut: 0.8,
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
        mode: 'scene',
        targetSceneId: 'scene_after',
        transitionType: 'slide',
        duration: 1.5,
      }), 'step_transition'),
    ];

    const saved = roundtrip(sceneWithTimeline(steps));

    expect(saved.timeline).toHaveLength(steps.length);
    steps.forEach((step, index) => {
      expect(saved.timeline[index]).toEqual(step);
    });
  });

  it('roundtrips inline effect parts between surrounding text steps', () => {
    const saved = roundtrip(sceneWithTimeline([
      createTextStep({ content: 'Світло ліхтаря ' }),
      withId(createEffectStep({
        effectType: 'rain',
        target: 'screen',
        intensity: 40,
        duration: 10,
        fadeIn: 1,
        fadeOut: 1,
      }), 'step_effect_rain'),
      createTextStep({ content: ' відкидало довгі тіні.' }),
    ]));

    expect(saved.timeline).toHaveLength(3);
    expect(saved.timeline[0]).toMatchObject({
      blockType: 'text',
      data: { content: 'Світло ліхтаря ' },
    });
    expect(saved.timeline[1]).toMatchObject({
      id: 'step_effect_rain',
      blockType: 'effect',
      data: {
        effectType: 'rain',
        target: 'screen',
        intensity: 40,
        duration: 10,
        fadeIn: 1,
        fadeOut: 1,
      },
    });
    expect(saved.timeline[2]).toMatchObject({
      blockType: 'text',
      data: { content: ' відкидало довгі тіні.' },
    });
  });

  it('renders standalone music and effect steps as inline chips instead of technical blocks', () => {
    const scene = sceneRecordToPlateDocument(sceneWithTimeline([
      withId(createMusicStep({ assetId: 'music_theme', mode: 'track', volume: 0.8, loop: true, fadeIn: 1, fadeOut: 0.8, boundTo: 'continuous' }), 'step_music'),
      withId(createEffectStep({
        effectType: 'rain',
        target: 'screen',
        intensity: 60,
        duration: 8,
      }), 'step_rain_standalone'),
      withId(createEffectStep({
        effectType: 'snow',
        target: 'screen',
        intensity: 30,
        duration: 8,
      }), 'step_snow_standalone'),
      withId(createCameraStep({ action: 'zoom', zoomLevel: 1.4, duration: 1, easing: 'linear' }), 'step_camera'),
    ]), []);

    const kinds = scene.blocks.map((block) => block.kind);
    expect(kinds).toEqual(['text', 'technical', 'text']);

    const chipBlock = scene.blocks[0];
    expect(chipBlock.kind).toBe('text');
    if (chipBlock.kind !== 'text') return;
    expect(chipBlock.content).toBe('');
    expect(chipBlock.parts?.map((part) => part.type)).toEqual(['music', 'effect', 'effect']);

    const saved = plateDocumentToSceneRecord(
      sceneWithTimeline([]),
      normalizePlateDocumentScene(cloneThroughPlateBridge(scene), []).scene,
      [],
    );
    expect(saved.timeline.map((step) => step.id)).toEqual([
      'step_music',
      'step_rain_standalone',
      'step_snow_standalone',
      'step_camera',
    ]);
    expect(saved.timeline[0]).toMatchObject({
      blockType: 'music',
      data: { assetId: 'music_theme', mode: 'track', volume: 0.8 },
    });
    expect(saved.timeline[1]).toMatchObject({
      blockType: 'effect',
      data: { effectType: 'rain', intensity: 60 },
    });
    expect(saved.timeline[2]).toMatchObject({
      blockType: 'effect',
      data: { effectType: 'snow', intensity: 30 },
    });
  });

  it('keeps effect steps with conditions or disabled state as technical blocks', () => {
    const conditionedEffect = withStepMeta(createEffectStep({
      effectType: 'rain',
      target: 'screen',
      intensity: 45,
      duration: 8,
    }), 'step_rain_conditioned');

    const scene = sceneRecordToPlateDocument(sceneWithTimeline([
      createTextStep({ content: 'Перед дощем' }),
      conditionedEffect,
      createTextStep({ content: 'після дощу' }),
    ]), []);

    const technicalBlocks = scene.blocks.filter((block) => block.kind === 'technical');
    expect(technicalBlocks).toHaveLength(1);
    expect(technicalBlocks[0].kind === 'technical' && technicalBlocks[0].blockType).toBe('effect');

    const saved = roundtrip(sceneWithTimeline([
      createTextStep({ content: 'Перед дощем' }),
      conditionedEffect,
      createTextStep({ content: 'після дощу' }),
    ]));
    const savedEffect = saved.timeline.find((step) => step.id === 'step_rain_conditioned');
    expect(savedEffect).toEqual(conditionedEffect);
  });

  it('preserves inline weather effect chips inside dialogue blocks', () => {
    const record = sceneWithTimeline([]);
    const saved = plateDocumentToSceneRecord(record, {
      sceneId: record.id,
      sceneName: record.name,
      blocks: [
        {
          id: 'doc_dialogue_inline_effect',
          kind: 'dialogue',
          speakerName: 'Masha',
          characterId: 'char_masha',
          spriteId: 'sprite_neutral',
          text: 'Rain starts now.',
          parts: [
            { type: 'text', text: 'Rain starts ' },
            {
              type: 'effect',
              id: 'step_dialogue_rain',
              effectType: 'rain',
              target: 'screen',
              intensity: 75,
              duration: 8,
              durationMode: 'scene',
              rain: {
                variant: 'storm',
                opacity: 0.62,
                density: 132,
                lightning: true,
              },
            },
            { type: 'text', text: 'now.' },
          ],
        },
        { id: 'doc_text_empty', kind: 'text', content: '' },
      ],
    }, []);

    expect(saved.timeline.map((step) => step.blockType)).toEqual([
      'character',
      'dialogue',
      'effect',
      'dialogue',
    ]);
    expect((saved.timeline[1].data as DialogueBlockData).entries[0]).toMatchObject({
      characterId: 'char_masha',
      speakerName: 'Masha',
      spriteId: 'sprite_neutral',
      text: 'Rain starts ',
    });
    expect(saved.timeline[2]).toMatchObject({
      id: 'step_dialogue_rain',
      blockType: 'effect',
      data: {
        effectType: 'rain',
        target: 'screen',
        intensity: 75,
        duration: 8,
        durationMode: 'scene',
        rain: {
          variant: 'storm',
          opacity: 0.62,
          density: 132,
          lightning: true,
        },
      },
    });
    expect((saved.timeline[3].data as DialogueBlockData).entries[0]).toMatchObject({
      characterId: 'char_masha',
      speakerName: 'Masha',
      spriteId: 'sprite_neutral',
      text: 'now.',
    });
  });

  it('roundtrips inline music and sound chips inside text and dialogue blocks', () => {
    const record = sceneWithTimeline([]);
    const saved = plateDocumentToSceneRecord(record, {
      sceneId: record.id,
      sceneName: record.name,
      blocks: [
        {
          id: 'doc_text_audio',
          kind: 'text',
          content: 'Audio cue.',
          parts: [
            { type: 'text', text: 'Start ' },
            {
              type: 'music',
              id: 'step_inline_music',
              mode: 'track',
              assetId: 'music_theme',
              volume: 0.55,
              loop: true,
              fadeIn: 1.8,
              fadeOut: 0.8,
              boundTo: 'continuous',
            },
            { type: 'text', text: ' after music.' },
          ],
        },
        {
          id: 'doc_dialogue_audio',
          kind: 'dialogue',
          speakerName: 'Masha',
          characterId: 'char_masha',
          spriteId: 'sprite_neutral',
          text: 'Door opens.',
          parts: [
            { type: 'text', text: 'Door ' },
            {
              type: 'sound',
              id: 'step_inline_sound',
              mode: 'track',
              assetId: 'sfx_door',
              volume: 0.7,
              loop: false,
              fadeIn: 0,
              fadeOut: 0.8,
              pitchVariation: 0.15,
            },
            { type: 'text', text: 'opens.' },
          ],
        },
        { id: 'doc_text_empty', kind: 'text', content: '' },
      ],
    }, []);

    expect(saved.timeline.map((step) => step.blockType)).toEqual([
      'text',
      'music',
      'text',
      'character',
      'dialogue',
      'sound',
      'dialogue',
    ]);
    expect(saved.timeline[1]).toMatchObject({
      id: 'step_inline_music',
      blockType: 'music',
      data: {
        mode: 'track',
        assetId: 'music_theme',
        volume: 0.55,
        loop: true,
        fadeIn: 1.8,
        fadeOut: 0.8,
        boundTo: 'continuous',
      },
    });
    expect(saved.timeline[5]).toMatchObject({
      id: 'step_inline_sound',
      blockType: 'sound',
      data: {
        mode: 'track',
        assetId: 'sfx_door',
        volume: 0.7,
        loop: false,
        fadeIn: 0,
        fadeOut: 0.8,
        pitchVariation: 0.15,
      },
    });
  });

  it('roundtrips inline weather effect options at text edges and between chips', () => {
    const saved = roundtrip(sceneWithTimeline([
      withId(createEffectStep({
        effectType: 'rain',
        target: 'background',
        intensity: 80,
        duration: 6,
        fadeIn: 0.5,
        fadeOut: 0.75,
        rain: {
          variant: 'fallout',
          color: '#9fd7ff',
          opacity: 0.65,
          density: 140,
          speed: 2.5,
          wind: 10,
          angle: -8,
          dropLength: 34,
          dropWidth: 2,
          splash: true,
          lightning: true,
          sound: false,
          soundVolume: 0.6,
        },
      }), 'step_rain_edge'),
      createTextStep({ content: 'Rain starts here' }),
      withId(createEffectStep({
        effectType: 'snow',
        target: 'screen',
        intensity: 35,
        duration: 4,
        snow: {
          color: '#ffffff',
          snowflakeCount: 96,
          radius: [0.5, 3],
          speed: [0.8, 2],
          wind: [-0.4, 1.2],
          changeFrequency: 180,
          rotationSpeed: [-1, 1],
          opacity: [0.55, 0.9],
          enable3DRotation: true,
          imageUris: ['file://flake.png'],
        },
      }), 'step_snow_middle'),
      withId(createEffectStep({
        effectType: 'fog',
        target: 'screen',
        intensity: 65,
        duration: 8,
        fog: {
          variant: 'dense',
        },
      }), 'step_fog_dense'),
      withId(createEffectStep({
        effectType: 'flash',
        target: 'screen',
        intensity: 55,
        duration: 0.4,
      }), 'step_flash_after_snow'),
    ]));

    expect(saved.timeline).toHaveLength(5);
    expect(saved.timeline[0]).toMatchObject({
      id: 'step_rain_edge',
      blockType: 'effect',
      data: {
        effectType: 'rain',
        target: 'background',
        intensity: 80,
        durationMode: 'timed',
        rain: {
          variant: 'fallout',
          density: 140,
          splash: true,
          lightning: true,
          sound: false,
          soundVolume: 0.6,
        },
      },
    });
    expect(saved.timeline[2]).toMatchObject({
      id: 'step_snow_middle',
      blockType: 'effect',
      data: {
        effectType: 'snow',
        durationMode: 'timed',
        snow: {
          snowflakeCount: 96,
          enable3DRotation: true,
          imageUris: ['file://flake.png'],
        },
      },
    });
    expect(saved.timeline[3]).toMatchObject({
      id: 'step_fog_dense',
      blockType: 'effect',
      data: {
        effectType: 'fog',
        durationMode: 'scene',
        fog: {
          variant: 'dense',
        },
      },
    });
    expect(saved.timeline[4]).toMatchObject({
      id: 'step_flash_after_snow',
      blockType: 'effect',
      data: {
        effectType: 'flash',
        intensity: 55,
      },
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

    expect(saved.timeline).toHaveLength(3);
    expect(saved.timeline[0]).toMatchObject({
      blockType: 'character',
      data: {
        action: 'show',
        generatedByInlineDialogue: true,
        characterId: 'char_alice',
        spriteId: 'sprite_neutral',
      },
    });
    const expectedDialogueData = dialogueStep.data as DialogueBlockData;
    expect(saved.timeline[1]).toEqual({
      ...dialogueStep,
      data: {
        ...expectedDialogueData,
        entries: [
          { ...expectedDialogueData.entries[0], speakerName: 'char_alice' },
          expectedDialogueData.entries[1],
        ],
        speakerFocus: { characterId: 'char_alice', enabled: true, scale: 1.04, dimOthers: true },
      },
    });
    expect(saved.timeline[2]).toEqual(choiceStep);
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

  it('normalizes inline audio part modes and numeric ranges from the webview payload', () => {
    const normalized = normalizePlateDocumentScene({
      sceneId: 'scene_audio_parts',
      sceneName: 'Audio Parts',
      blocks: [
        {
          id: 'doc_audio_parts',
          kind: 'text',
          content: '',
          parts: [
            { type: 'music', id: '', mode: 'track', assetId: '', volume: 3, loop: 'false', fadeIn: -20, fadeOut: 2, boundTo: 'continuous' },
            { type: 'sound', id: 'sound_part', mode: 'track', assetId: 'sfx', volume: -1, loop: 'true', fadeIn: 0, fadeOut: 0.5, pitchVariation: 4 },
          ],
        },
      ],
    } as unknown as PlateDocumentScene, []);

    const block = normalized.scene.blocks[0];
    expect(block.kind).toBe('text');
    if (block.kind !== 'text') return;
    expect(block.parts?.[0]).toMatchObject({
      type: 'music',
      mode: 'track',
      assetId: null,
      volume: 1,
      loop: false,
      fadeIn: 0,
      fadeOut: 2,
      boundTo: 'continuous',
    });
    expect(block.parts?.[1]).toMatchObject({
      type: 'sound',
      id: 'sound_part',
      mode: 'track',
      assetId: 'sfx',
      volume: 0,
      loop: true,
      fadeIn: 0,
      fadeOut: 0.5,
      pitchVariation: 1,
    });
    expect(normalized.scene.blocks[1]).toMatchObject({ kind: 'text', content: '' });
  });

  it('normalizes legacy technical character blocks into dialogue blocks', () => {
    const plateDocument: PlateDocumentScene = {
      sceneId: 'scene_legacy_character',
      sceneName: 'Legacy Character',
      blocks: [
        {
          id: 'doc_legacy_character',
          kind: 'technical',
          commandId: 'character',
          blockType: 'character',
          label: 'Alice',
          summary: 'sprite_neutral · center',
          step: createCharacterStep({
            characterId: 'char_alice',
            spriteId: 'sprite_neutral',
            position: 'center',
          }),
        },
      ],
    };

    const normalized = normalizePlateDocumentScene(cloneThroughPlateBridge(plateDocument), [{
      id: 'char_alice',
      name: 'Alice',
      color: '#ff4d6d',
      defaultSpriteId: 'sprite_neutral',
      authoring: { currentSpriteId: 'sprite_neutral', currentPosition: 'center', focusOnSpeak: true },
      sprites: [{ id: 'sprite_neutral', name: 'Neutral', uri: 'file://alice.png', createdAt: 1 }],
      createdAt: 1,
    }]);
    const block = normalized.scene.blocks[0];

    expect(block.kind).toBe('dialogue');
    if (block.kind !== 'dialogue') return;
    expect(block.speakerName).toBe('Alice');
    expect(block.characterId).toBe('char_alice');
    expect(block.spriteId).toBe('sprite_neutral');
    expect(block.openCharacterControls).toBe(true);
  });

  it('normalizes text shorthand speaker lines into dialogue blocks', () => {
    const normalized = normalizePlateDocumentScene({
      sceneId: 'scene_text_speakers',
      sceneName: 'Text speakers',
      blocks: [
        { id: 'doc_masha_empty', kind: 'text', content: 'Маша:' },
        { id: 'doc_dima_text', kind: 'text', content: 'Діма: Привіт' },
        { id: 'doc_url', kind: 'text', content: 'https://example.com/path' },
      ],
    }, []);

    const [masha, dima, url] = normalized.scene.blocks;

    expect(masha.kind).toBe('dialogue');
    if (masha.kind === 'dialogue') {
      expect(masha.speakerName).toBe('Маша');
      expect(masha.text).toBe('');
      expect(masha.characterId).toBeTruthy();
      expect(masha.openCharacterControls).toBe(false);
    }

    expect(dima.kind).toBe('dialogue');
    if (dima.kind === 'dialogue') {
      expect(dima.speakerName).toBe('Діма');
      expect(dima.text).toBe('Привіт');
      expect(dima.characterId).toBeTruthy();
    }

    expect(url).toMatchObject({
      kind: 'text',
      content: 'https://example.com/path',
    });
    expect(normalized.characters.map((character) => character.name)).toEqual(['Маша', 'Діма']);
  });

  it('preserves inline effect parts when text shorthand becomes dialogue', () => {
    const record = sceneWithTimeline([]);
    const normalized = normalizePlateDocumentScene({
      sceneId: record.id,
      sceneName: record.name,
      blocks: [
        {
          id: 'doc_masha_rain_text',
          kind: 'text',
          content: 'Masha: Rain starts now.',
          parts: [
            { type: 'text', text: 'Masha: Rain starts ' },
            {
              type: 'effect',
              id: 'step_text_shorthand_rain',
              effectType: 'rain',
              target: 'screen',
              intensity: 70,
              duration: 8,
              rain: {
                density: 128,
                opacity: 0.58,
                lightning: true,
              },
            },
            { type: 'text', text: 'now.' },
          ],
        },
      ],
    }, []);

    const [dialogue] = normalized.scene.blocks;
    expect(dialogue.kind).toBe('dialogue');
    if (dialogue.kind !== 'dialogue') return;
    expect(dialogue.text).toBe('Rain starts now.');
    expect(dialogue.parts?.[0]).toEqual({ type: 'text', text: 'Rain starts ' });

    const saved = plateDocumentToSceneRecord(record, normalized.scene, normalized.characters);

    expect(saved.timeline.map((step) => step.blockType)).toEqual([
      'character',
      'dialogue',
      'effect',
      'dialogue',
    ]);
    expect((saved.timeline[1].data as DialogueBlockData).entries[0].text).toBe('Rain starts ');
    expect(saved.timeline[2]).toMatchObject({
      id: 'step_text_shorthand_rain',
      blockType: 'effect',
      data: {
        effectType: 'rain',
        target: 'screen',
        intensity: 70,
        duration: 8,
        rain: {
          density: 128,
          opacity: 0.58,
          lightning: true,
        },
      },
    });
    expect((saved.timeline[3].data as DialogueBlockData).entries[0].text).toBe('now.');
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
      backgroundAssets: [
        {
          id: 'bg_forest',
          name: 'Forest.png',
          uri: 'file:///media/forest.png',
        },
      ],
      isPhone: false,
    });

    expect(html).toContain('data-kind="technical"');
    expect(html).toContain('data-id="step_background"');
    expect(html).toContain('data-command="background"');
    expect(html).toContain('Forest');
    expect(html).not.toContain('background-thumb');
    expect(html).toContain('"id":"newScene"');
    expect(html).toContain("type: 'createNextScene'");
  });

  it('renders inline effect parts as compact effect chips in embedded HTML', () => {
    const scene = sceneRecordToPlateDocument(sceneWithTimeline([
      createTextStep({ content: 'Перед дощем ' }),
      createEffectStep({
        effectType: 'rain',
        target: 'screen',
        intensity: 40,
        duration: 10,
      }),
      createTextStep({ content: ' стало тихо.' }),
    ]), []);

    const html = createVNPlateEditorHtml({
      editorId: 'editor_inline_effect',
      scene,
      characters: [],
      backgroundAssets: [],
      isPhone: false,
    });

    expect(html).toContain('class="effect-chip"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('data-effect-type="rain"');
    expect(html).toContain('data-intensity="40"');
    expect(html).toContain('Перед дощем ');
    expect(html).toContain(' стало тихо.');
  });

  it('renders inline audio parts as compact audio chips in embedded HTML', () => {
    const scene = sceneRecordToPlateDocument(sceneWithTimeline([
      withId(createMusicStep({ assetId: 'music_theme', mode: 'track', volume: 0.5, loop: true, fadeIn: 1.2, fadeOut: 0.8, boundTo: 'continuous' }), 'step_music_theme'),
      withId(createSoundStep({ assetId: 'sfx_door', mode: 'track', volume: 0.7, loop: false, fadeIn: 0, fadeOut: 0.8, pitchVariation: 0.2 }), 'step_sfx_door'),
    ]), []);

    const html = createVNPlateEditorHtml({
      editorId: 'editor_inline_audio',
      scene,
      characters: [],
      backgroundAssets: [],
      audioAssets: [
        { id: 'music_theme', name: 'Theme.mp3', uri: 'data:audio/mpeg;base64,AAA=', type: 'music' },
        { id: 'sfx_door', name: 'Door.wav', uri: 'data:audio/wav;base64,AAA=', type: 'sfx' },
      ],
      isPhone: false,
    });

    expect(html).toContain('class="audio-chip audio-chip--music"');
    expect(html).toContain('class="audio-chip audio-chip--sound"');
    expect(html).toContain('data-asset-id="music_theme"');
    expect(html).toContain('data-fade-in="1.2"');
    expect(html).toContain('data-fade-out="0.8"');
    expect(html).toContain('data-pitch-variation="0.2"');
    expect(html).toContain('Theme');
    expect(html).toContain('Door');
    expect(html).toContain('Згасання');
    expect(html).toContain('Обрати трек');
    expect(html).toContain("message.type === 'audioAssetsUpdated'");
    expect(html).toContain("type: 'uploadAudioAsset'");
  });

  it('does not render inline background thumbnail when background asset is missing', () => {
    const backgroundStep = withStepMeta(
      createBackgroundStep({
        assetId: 'bg_missing',
        transition: 'fade',
        duration: 500,
      }),
      'step_background',
    );
    const scene = sceneRecordToPlateDocument(sceneWithTimeline([backgroundStep]), []);

    const html = createVNPlateEditorHtml({
      editorId: 'editor_missing_background',
      scene,
      characters: [],
      backgroundAssets: [],
      isPhone: false,
    });

    expect(html).toContain('data-asset-id="bg_missing"');
    expect(html).not.toContain('background-thumb');
  });

  it('auto-applies uploaded background assets to the active background block', () => {
    const html = createVNPlateEditorHtml({
      editorId: 'editor_upload_background',
      scene: sceneRecordToPlateDocument(sceneWithTimeline([createBackgroundStep()]), []),
      characters: [],
      backgroundAssets: [],
      isPhone: false,
    });

    expect(html).toContain("message.type === 'backgroundAssetUploaded'");
    expect(html).toContain('applyBackgroundData(activeBackgroundBlock');
    expect(html).toContain('assetId: message.asset.id');
    expect(html).toContain('saveNow();');
  });

  it('supports explicit flush and character update messages without rebuilding the frame', () => {
    const html = createVNPlateEditorHtml({
      editorId: 'editor_flush_contract',
      scene: sceneRecordToPlateDocument(sceneWithTimeline([createTextStep({ content: 'Draft' })]), []),
      characters: [],
      backgroundAssets: [],
      isPhone: false,
    });

    expect(html).toContain("message.type === 'flush'");
    expect(html).toContain("type: 'flushed'");
    expect(html).toContain('requestId: message.requestId');
    expect(html).toContain("message.type === 'charactersUpdated'");
    expect(html).toContain('characters = message.characters.map(migrateCharacter)');
  });

  it('strips only a repeated speaker prefix from dialogue text', () => {
    const html = createVNPlateEditorHtml({
      editorId: 'editor_repeated_speaker_prefix',
      scene: sceneRecordToPlateDocument(sceneWithTimeline([createTextStep({ content: 'Draft' })]), []),
      characters: [],
      backgroundAssets: [],
      isPhone: false,
    });

    expect(html).toContain('function stripLeadingSpeakerLabel');
    expect(html).toContain('var withoutBadge = stripLeadingSpeakerLabel(raw, speaker);');
    expect(html).toContain('return stripLeadingSpeakerLabel(withoutBadge, speaker);');
    expect(html).not.toContain("raw.replace(/^.*?:\\\\s*/, '')");
  });
});
