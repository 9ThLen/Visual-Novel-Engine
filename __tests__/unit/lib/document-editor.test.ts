import { searchDocumentCommands } from '@/lib/document-editor/commands';
import {
  createDocumentTechnicalBlock,
  documentSceneToConnections,
  documentSceneToTimeline,
  ensureDocumentCharacters,
  ensureDocumentCharactersInBlocks,
  orderSceneRecordsForDocument,
  parseDraftLineToDocumentBlock,
  sceneRecordToDocumentScene,
} from '@/lib/document-editor/document-scene';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import { createBackgroundStep } from '@/lib/engine/event-factory';

describe('document editor commands', () => {
  it('finds background by Ukrainian image aliases and English aliases', () => {
    expect(searchDocumentCommands('/карт')[0]?.id).toBe('background');
    expect(searchDocumentCommands('/зобр')[0]?.id).toBe('background');
    expect(searchDocumentCommands('/bg')[0]?.id).toBe('background');
    expect(searchDocumentCommands('/picture')[0]?.id).toBe('background');
  });

  it('finds character and sprite by human aliases', () => {
    expect(searchDocumentCommands('/гер')[0]?.id).toBe('character');
    expect(searchDocumentCommands('/емо')[0]?.id).toBe('sprite');
  });

  it('finds character and sprite by English human aliases', () => {
    expect(searchDocumentCommands('/hero')[0]?.id).toBe('character');
    expect(searchDocumentCommands('/actor')[0]?.id).toBe('character');
    expect(searchDocumentCommands('/pose')[0]?.id).toBe('sprite');
    expect(searchDocumentCommands('/expression')[0]?.id).toBe('sprite');
  });

  it('finds new scene by page aliases', () => {
    expect(searchDocumentCommands('/нова сцена')[0]?.id).toBe('newScene');
    expect(searchDocumentCommands('/лист')[0]?.id).toBe('newScene');
    expect(searchDocumentCommands('/page')[0]?.id).toBe('newScene');
  });
});

describe('document scene parser/compiler', () => {
  function createTestSceneRecord(id: string, nextSceneId: string | null = null, isStart = false): SceneRecord {
    return {
      id,
      storyId: 'story_1',
      name: id,
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
      connections: nextSceneId ? [{ targetSceneId: nextSceneId, outputPort: 'next', label: 'Next' }] : [],
      isStart,
      createdAt: Number(id.replace(/\D/g, '')) || 1,
      updatedAt: 1,
    };
  }

  it('orders scenes as sequential document pages through next connections', () => {
    const ordered = orderSceneRecordsForDocument([
      createTestSceneRecord('scene_3'),
      createTestSceneRecord('scene_1', 'scene_2', true),
      createTestSceneRecord('scene_2', 'scene_3'),
    ]);

    expect(ordered.map((scene) => scene.id)).toEqual(['scene_1', 'scene_2', 'scene_3']);
  });

  it('parses dialogue shorthand and auto-creates missing characters', () => {
    const block = parseDraftLineToDocumentBlock('Макс: Привіт!', []);
    expect(block.kind).toBe('dialogue');
    if (block.kind !== 'dialogue') throw new Error('Expected dialogue block');

    const characters = ensureDocumentCharacters([block], []);
    expect(characters).toHaveLength(1);
    expect(characters[0].name).toBe('Макс');
    expect(block.characterId).toBe(characters[0].id);
  });

  it('returns updated dialogue blocks when auto-creating missing characters', () => {
    const block = parseDraftLineToDocumentBlock('Alice: Hello!', []);
    expect(block.kind).toBe('dialogue');
    if (block.kind !== 'dialogue') throw new Error('Expected dialogue block');

    const result = ensureDocumentCharactersInBlocks([block], []);
    const ensuredBlock = result.blocks[0];

    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].name).toBe('Alice');
    expect(ensuredBlock.kind).toBe('dialogue');
    if (ensuredBlock.kind !== 'dialogue') throw new Error('Expected dialogue block');
    expect(ensuredBlock.characterId).toBe(result.characters[0].id);
    expect(block.characterId).toBeNull();
  });

  it('converts slash aliases into technical blocks', () => {
    const block = parseDraftLineToDocumentBlock('/картинка', []);
    expect(block.kind).toBe('technical');
    if (block.kind !== 'technical') throw new Error('Expected technical block');
    expect(block.commandId).toBe('background');
    expect(block.blockType).toBe('background');
  });

  it('reuses existing characters case-insensitively when parsing dialogue', () => {
    const characters: Character[] = [{
      id: 'char_max',
      name: 'Max',
      defaultSpriteId: 'sprite_neutral',
      sprites: [{ id: 'sprite_neutral', name: 'Neutral', uri: 'max.png', createdAt: 1 }],
      createdAt: 1,
    }];

    const block = parseDraftLineToDocumentBlock('max: Hello there', characters);
    expect(block.kind).toBe('dialogue');
    if (block.kind !== 'dialogue') throw new Error('Expected dialogue block');

    const nextCharacters = ensureDocumentCharacters([block], characters);
    expect(nextCharacters).toHaveLength(1);
    expect(block.characterId).toBe('char_max');
    expect(block.spriteId).toBe('sprite_neutral');
  });

  it('creates sprite commands from nearby dialogue context', () => {
    const speaker = {
      id: 'dialogue_1',
      kind: 'dialogue' as const,
      speakerName: 'Max',
      characterId: 'char_max',
      spriteId: 'sprite_happy',
      text: 'Hello.',
    };

    const block = createDocumentTechnicalBlock('sprite', [], speaker);
    expect(block.blockType).toBe('character');
    expect((block.step.data as any).characterId).toBe('char_max');
    expect((block.step.data as any).spriteId).toBe('sprite_happy');
  });

  it('compiles text, dialogue, choice, and technical blocks to timeline steps', () => {
    const characters: Character[] = [{
      id: 'char_max',
      name: 'Макс',
      sprites: [],
      createdAt: 1,
    }];

    const documentScene: DocumentScene = {
      sceneId: 'scene_1',
      sceneName: 'Початок',
      blocks: [
        { id: 'text_1', kind: 'text', content: 'Ранок у школі.' },
        { id: 'dialogue_1', kind: 'dialogue', speakerName: 'Макс', characterId: 'char_max', spriteId: null, text: 'Привіт!' },
        {
          id: 'choice_1',
          kind: 'choice',
          question: 'Що зробити?',
          options: [
            { id: 'choice_a', text: 'Піти вперед', targetSceneId: 'scene_2' },
            { id: 'choice_b', text: 'Залишитись', targetSceneId: null },
          ],
        },
        {
          id: 'tech_1',
          kind: 'technical',
          commandId: 'background',
          blockType: 'background',
          label: 'Фон',
          summary: 'school · fade',
          step: createBackgroundStep({ assetId: 'school' }),
        },
      ],
    };

    const timeline = documentSceneToTimeline(documentScene);
    expect(timeline.map((step) => step.blockType)).toEqual(['text', 'dialogue', 'choice', 'background']);
  });

  it('saves next-scene connection for document page creation', () => {
    const connections = documentSceneToConnections(
      { sceneId: 'scene_1', sceneName: 'Початок', blocks: [{ id: 'text_1', kind: 'text', content: 'Текст.' }] },
      'scene_2'
    );

    expect(connections).toEqual([{ targetSceneId: 'scene_2', outputPort: 'next', label: 'Next' }]);
  });

  it('combines choice branches with the sequential next page connection', () => {
    const connections = documentSceneToConnections(
      {
        sceneId: 'scene_1',
        sceneName: 'Scene 1',
        blocks: [{
          id: 'choice_1',
          kind: 'choice',
          question: 'Where next?',
          options: [
            { id: 'choice_left', text: 'Left', targetSceneId: 'scene_left' },
            { id: 'choice_stay', text: 'Stay', targetSceneId: null },
          ],
        }],
      },
      'scene_2'
    );

    expect(connections).toEqual([
      { targetSceneId: 'scene_left', outputPort: 'choice_left', label: 'Left' },
      { targetSceneId: 'scene_2', outputPort: 'next', label: 'Next' },
    ]);
  });

  it('round-trips canonical background as a document technical chip', () => {
    const sceneRecord: SceneRecord = {
      id: 'scene_1',
      storyId: 'story_1',
      name: 'Початок',
      description: '',
      tags: [],
      timeline: [createBackgroundStep({ assetId: 'school' })],
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

    const documentScene = sceneRecordToDocumentScene(sceneRecord, []);
    expect(documentScene.blocks[0]?.kind).toBe('technical');
    expect(documentSceneToTimeline(documentScene)[0]?.blockType).toBe('background');
  });

  it('splits legacy multiline text into narration and dialogue blocks', () => {
    const sceneRecord: SceneRecord = {
      id: 'scene_1',
      storyId: 'story_1',
      name: 'scene_1',
      description: '',
      tags: [],
      timeline: [{
        id: 'step_text',
        blockType: 'text',
        collapsed: false,
        enabled: true,
        data: {
          content: 'Прийшов день.\nМакс: Я тут.\nМарлена: Привіт, Макс.',
          typewriterSpeed: 0.5,
          anchorTo: 'background',
        },
      }],
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

    const documentScene = sceneRecordToDocumentScene(sceneRecord, []);
    expect(documentScene.blocks.map((block) => block.kind)).toEqual(['text', 'dialogue', 'dialogue']);
  });
});
