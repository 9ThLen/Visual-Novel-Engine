import { searchDocumentCommands } from '@/lib/document-editor/commands';
import {
  documentSceneToConnections,
  documentSceneToTimeline,
  ensureDocumentCharacters,
  ensureDocumentCharactersInBlocks,
  orderSceneRecordsForDocument,
  parseDraftLineToDocumentBlock,
  resolveNextSceneIdForSave,
  sceneRecordToDocumentScene,
} from '@/lib/document-editor/document-scene';
import { buildDocumentsResetKey } from '@/lib/document-editor/document-reset-key';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord, TransitionBlockData } from '@/lib/engine/types';
import { BLOCK_TYPE_INFO } from '@/lib/engine/types';
import { createBackgroundStep, createTransitionStep } from '@/lib/engine/event-factory';

describe('document editor commands', () => {
  it('finds background by Ukrainian image aliases and English aliases', () => {
    expect(searchDocumentCommands('/карт')[0]?.id).toBe('background');
    expect(searchDocumentCommands('/зобр')[0]?.id).toBe('background');
    expect(searchDocumentCommands('/bg')[0]?.id).toBe('background');
    expect(searchDocumentCommands('/picture')[0]?.id).toBe('background');
  });

  it('finds character by human aliases', () => {
    expect(searchDocumentCommands('/гер')[0]?.id).toBe('character');
    expect(searchDocumentCommands('/персонаж')[0]?.id).toBe('character');
  });

  it('finds character by English human aliases', () => {
    expect(searchDocumentCommands('/hero')[0]?.id).toBe('character');
    expect(searchDocumentCommands('/actor')[0]?.id).toBe('character');
    expect(searchDocumentCommands('/pose')).toEqual([]);
    expect(searchDocumentCommands('/expression')).toEqual([]);
  });

  it('finds new scene by page aliases', () => {
    expect(searchDocumentCommands('/нова сцена')[0]?.id).toBe('newScene');
    expect(searchDocumentCommands('/лист')[0]?.id).toBe('newScene');
    expect(searchDocumentCommands('/page')[0]?.id).toBe('newScene');
  });

  it('does not mark implemented slash blocks as coming soon', () => {
    for (const blockType of ['sound', 'camera', 'interactive_object'] as const) {
      expect(BLOCK_TYPE_INFO[blockType].comingSoon).toBeFalsy();
      expect(BLOCK_TYPE_INFO[blockType].disabled).toBeFalsy();
    }
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

  it('keeps document reset key stable across equivalent scene arrays', () => {
    const first = [
      createTestSceneRecord('scene_1', null, true),
      createTestSceneRecord('scene_2'),
    ];
    const second = first.map((scene) => ({ ...scene }));

    expect(buildDocumentsResetKey('scene_1', first)).toBe(buildDocumentsResetKey('scene_1', second));
    expect(buildDocumentsResetKey('scene_2', first)).not.toBe(buildDocumentsResetKey('scene_1', first));
    expect(buildDocumentsResetKey('scene_1', [{ ...first[0], updatedAt: 2 }, first[1]])).not.toBe(
      buildDocumentsResetKey('scene_1', first),
    );
  });

  it('parses dialogue shorthand and auto-creates missing characters', () => {
    const block = parseDraftLineToDocumentBlock('ĐśĐ°ĐşŃ: ĐźŃ€Đ¸Đ˛Ń–Ń‚!', []);
    expect(block.kind).toBe('dialogue');
    if (block.kind !== 'dialogue') throw new Error('Expected dialogue block');

    const characters = ensureDocumentCharacters([block], []);
    expect(characters).toHaveLength(1);
    expect(characters[0].name).toBe('ĐśĐ°ĐşŃ');
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

  it('creates separate characters for different speaker-only names', () => {
    const masha = parseDraftLineToDocumentBlock('Маша:', []);
    const dima = parseDraftLineToDocumentBlock('Діма:', []);
    const alina = parseDraftLineToDocumentBlock('Аліна:', []);

    const result = ensureDocumentCharactersInBlocks([masha, dima, alina], []);

    expect(result.characters.map((character) => character.name)).toEqual(['Маша', 'Діма', 'Аліна']);
    const ids = result.blocks.map((block) => block.kind === 'dialogue' ? block.characterId : null);
    expect(new Set(ids).size).toBe(3);
  });

  it('converts slash aliases into technical blocks', () => {
    const block = parseDraftLineToDocumentBlock('/картинка', []);
    expect(block.kind).toBe('technical');
    if (block.kind !== 'technical') throw new Error('Expected technical block');
    expect(block.commandId).toBe('background');
    expect(block.blockType).toBe('background');
  });

  it('converts /character into the same dialogue block shape as typed speaker shorthand', () => {
    const block = parseDraftLineToDocumentBlock('/character', []);
    expect(block.kind).toBe('dialogue');
    if (block.kind !== 'dialogue') throw new Error('Expected dialogue block');
    expect(block.speakerName).toBe('Character');
    expect(block.characterId).toBeNull();
    expect(block.openCharacterControls).toBe(true);

    const result = ensureDocumentCharactersInBlocks([block], []);
    const ensured = result.blocks[0];
    expect(result.characters).toHaveLength(1);
    expect(ensured.kind).toBe('dialogue');
    if (ensured.kind !== 'dialogue') throw new Error('Expected dialogue block');
    expect(ensured.characterId).toBe(result.characters[0].id);
  });

  it('reuses existing characters case-insensitively when parsing dialogue', () => {
    const characters: Character[] = [{
      id: 'char_max',
      name: 'Max',
      defaultSpriteId: 'sprite_neutral',
      authoring: { currentSpriteId: 'sprite_happy', currentPosition: 'center', focusOnSpeak: true },
      sprites: [{ id: 'sprite_neutral', name: 'Neutral', uri: 'max.png', createdAt: 1 }],
      createdAt: 1,
    }];

    const block = parseDraftLineToDocumentBlock('max: Hello there', characters);
    expect(block.kind).toBe('dialogue');
    if (block.kind !== 'dialogue') throw new Error('Expected dialogue block');

    const nextCharacters = ensureDocumentCharacters([block], characters);
    expect(nextCharacters).toHaveLength(1);
    expect(block.characterId).toBe('char_max');
    expect(block.spriteId).toBe('sprite_happy');
  });

  it('does not parse URL-like text as dialogue shorthand', () => {
    const block = parseDraftLineToDocumentBlock('https://example.com/path', []);

    expect(block.kind).toBe('text');
  });

  it('auto-creates migrated characters with color and first-use marker', () => {
    const block = parseDraftLineToDocumentBlock('Alice: Hello!', []);
    if (block.kind !== 'dialogue') throw new Error('Expected dialogue block');

    const result = ensureDocumentCharactersInBlocks([block], []);
    const ensuredBlock = result.blocks[0];

    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].color).toMatch(/^#/);
    expect(result.characters[0].authoring?.currentPosition).toBe('center');
    expect(ensuredBlock.kind).toBe('dialogue');
    if (ensuredBlock.kind !== 'dialogue') throw new Error('Expected dialogue block');
    expect(ensuredBlock.openCharacterControls).toBe(true);
    expect(ensuredBlock.tokenColor).toBe(result.characters[0].color);
  });

  it('does not duplicate speaker names with whitespace and case variants', () => {
    const first = parseDraftLineToDocumentBlock('Alice: One', []);
    if (first.kind !== 'dialogue') throw new Error('Expected dialogue block');
    const created = ensureDocumentCharactersInBlocks([first], []);

    const second = parseDraftLineToDocumentBlock('  ALICE: Two', created.characters);
    if (second.kind !== 'dialogue') throw new Error('Expected dialogue block');
    const ensured = ensureDocumentCharactersInBlocks([second], created.characters);

    expect(ensured.characters).toHaveLength(1);
    expect(second.characterId).toBe(created.characters[0].id);
  });

  it('compiles text, dialogue, choice, and technical blocks to timeline steps', () => {
    const characters: Character[] = [{
      id: 'char_max',
      name: 'ĐśĐ°ĐşŃ',
      sprites: [],
      createdAt: 1,
    }];

    const documentScene: DocumentScene = {
      sceneId: 'scene_1',
      sceneName: 'ĐźĐľŃ‡Đ°Ń‚ĐľĐş',
      blocks: [
        { id: 'text_1', kind: 'text', content: 'Đ Đ°Đ˝ĐľĐş Ń ŃĐşĐľĐ»Ń–.' },
        { id: 'dialogue_1', kind: 'dialogue', speakerName: 'ĐśĐ°ĐşŃ', characterId: 'char_max', spriteId: null, text: 'ĐźŃ€Đ¸Đ˛Ń–Ń‚!' },
        {
          id: 'choice_1',
          kind: 'choice',
          question: 'Đ©Đľ Đ·Ń€ĐľĐ±Đ¸Ń‚Đ¸?',
          options: [
            { id: 'choice_a', text: 'ĐźŃ–Ń‚Đ¸ Đ˛ĐżĐµŃ€ĐµĐ´', targetSceneId: 'scene_2' },
            { id: 'choice_b', text: 'Đ—Đ°Đ»Đ¸ŃĐ¸Ń‚Đ¸ŃŃŚ', targetSceneId: null },
          ],
        },
        {
          id: 'tech_1',
          kind: 'technical',
          commandId: 'background',
          blockType: 'background',
          label: 'Đ¤ĐľĐ˝',
          summary: 'school Â· fade',
          step: createBackgroundStep({ assetId: 'school' }),
        },
      ],
    };

    const timeline = documentSceneToTimeline(documentScene);
    expect(timeline.map((step) => step.blockType)).toEqual(['text', 'character', 'dialogue', 'choice', 'background']);
    expect((timeline[1].data as any).generatedByInlineDialogue).toBe(true);
  });

  it('saves next-scene connection for document page creation', () => {
    const connections = documentSceneToConnections(
      { sceneId: 'scene_1', sceneName: 'ĐźĐľŃ‡Đ°Ń‚ĐľĐş', blocks: [{ id: 'text_1', kind: 'text', content: 'Đ˘ĐµĐşŃŃ‚.' }] },
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

  it('lets a transition block override the next connection', () => {
    const transitionBlock = (
      overrides: Partial<TransitionBlockData>,
      enabled = true,
      id = 'tech_transition',
    ) => {
      const step = createTransitionStep(overrides);
      return {
        id,
        kind: 'technical' as const,
        commandId: 'transition' as const,
        blockType: 'transition' as const,
        label: 'Перехід',
        summary: '',
        step: { ...step, enabled },
      };
    };
    const sceneWith = (...blocks: ReturnType<typeof transitionBlock>[]): DocumentScene => ({
      sceneId: 'scene_1',
      sceneName: 'Scene 1',
      blocks,
    });

    // mode 'scene' replaces the document-order neighbour
    expect(documentSceneToConnections(
      sceneWith(transitionBlock({ mode: 'scene', targetSceneId: 'scene_9', transitionType: 'fade', duration: 0.5 })),
      'scene_2',
    )).toEqual([{ targetSceneId: 'scene_9', outputPort: 'next', label: 'Next' }]);

    // mode 'end' removes the next connection entirely
    expect(documentSceneToConnections(
      sceneWith(transitionBlock({ mode: 'end', targetSceneId: null, transitionType: 'fade', duration: 0.5 })),
      'scene_2',
    )).toEqual([]);

    // mode 'next' keeps document order
    expect(documentSceneToConnections(
      sceneWith(transitionBlock({ mode: 'next', targetSceneId: null, transitionType: 'fade', duration: 0.5 })),
      'scene_2',
    )).toEqual([{ targetSceneId: 'scene_2', outputPort: 'next', label: 'Next' }]);

    // legacy data without mode: explicit target still wins
    expect(documentSceneToConnections(
      sceneWith(transitionBlock({ targetSceneId: 'scene_9', transitionType: 'fade', duration: 0.5 })),
      'scene_2',
    )).toEqual([{ targetSceneId: 'scene_9', outputPort: 'next', label: 'Next' }]);
  });

  it('save preserves the existing next connection over the document-order neighbour', () => {
    // Regression guard for active-path rendering: the document neighbour of a
    // choice scene is the selected branch's first scene. Persisting it as
    // `next` would corrupt the null-option fallback (reader semantics: a
    // choice option with targetSceneId null follows the `next` connection).
    const choiceScene = {
      connections: [
        { targetSceneId: 'scene_branch_a_start', outputPort: 'choice_a', label: 'A' },
        { targetSceneId: 'scene_fallback', outputPort: 'next', label: 'Next' },
      ],
    };

    // Document renders branch A after the choice scene, but `next` must survive.
    expect(resolveNextSceneIdForSave(choiceScene, 'scene_branch_a_start')).toBe('scene_fallback');

    const connections = documentSceneToConnections(
      {
        sceneId: 'scene_1',
        sceneName: 'Choice scene',
        blocks: [{
          id: 'choice_1',
          kind: 'choice',
          question: 'Where next?',
          options: [
            { id: 'choice_a', text: 'A', targetSceneId: 'scene_branch_a_start' },
            { id: 'choice_b', text: 'B', targetSceneId: null },
          ],
        }],
      },
      resolveNextSceneIdForSave(choiceScene, 'scene_branch_a_start'),
    );

    expect(connections).toEqual([
      { targetSceneId: 'scene_branch_a_start', outputPort: 'choice_a', label: 'A' },
      { targetSceneId: 'scene_fallback', outputPort: 'next', label: 'Next' },
    ]);
  });

  it('save falls back to the document-order neighbour only for scenes without a next connection', () => {
    expect(resolveNextSceneIdForSave({ connections: [] }, 'scene_2')).toBe('scene_2');
    expect(resolveNextSceneIdForSave({ connections: undefined as any }, 'scene_2')).toBe('scene_2');
    expect(resolveNextSceneIdForSave(
      { connections: [{ targetSceneId: 'scene_x', outputPort: 'choice_a' }] },
      'scene_2',
    )).toBe('scene_2');
    expect(resolveNextSceneIdForSave({ connections: [] }, undefined)).toBeUndefined();
  });

  it('uses the first enabled transition block for the next connection', () => {
    const transitionBlock = (
      overrides: Partial<TransitionBlockData>,
      enabled = true,
      id = 'tech_transition',
    ) => {
      const step = createTransitionStep(overrides);
      return {
        id,
        kind: 'technical' as const,
        commandId: 'transition' as const,
        blockType: 'transition' as const,
        label: 'Перехід',
        summary: '',
        step: { ...step, enabled },
      };
    };
    const sceneWith = (...blocks: ReturnType<typeof transitionBlock>[]): DocumentScene => ({
      sceneId: 'scene_1',
      sceneName: 'Scene 1',
      blocks,
    });

    expect(documentSceneToConnections(
      sceneWith(
        transitionBlock({ mode: 'end', targetSceneId: null, transitionType: 'fade', duration: 0.5 }, true, 'first'),
        transitionBlock({ mode: 'scene', targetSceneId: 'scene_9', transitionType: 'fade', duration: 0.5 }, true, 'second'),
      ),
      'scene_2',
    )).toEqual([]);

    expect(documentSceneToConnections(
      sceneWith(
        transitionBlock({ mode: 'end', targetSceneId: null, transitionType: 'fade', duration: 0.5 }, false, 'first'),
        transitionBlock({ mode: 'scene', targetSceneId: 'scene_9', transitionType: 'fade', duration: 0.5 }, true, 'second'),
      ),
      'scene_2',
    )).toEqual([{ targetSceneId: 'scene_9', outputPort: 'next', label: 'Next' }]);
  });

  it('round-trips canonical background as a document technical chip', () => {
    const sceneRecord: SceneRecord = {
      id: 'scene_1',
      storyId: 'story_1',
      name: 'ĐźĐľŃ‡Đ°Ń‚ĐľĐş',
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
          content: 'ĐźŃ€Đ¸ĐąŃĐľĐ˛ Đ´ĐµĐ˝ŃŚ.\nĐśĐ°ĐşŃ: ĐŻ Ń‚ŃŃ‚.\nĐśĐ°Ń€Đ»ĐµĐ˝Đ°: ĐźŃ€Đ¸Đ˛Ń–Ń‚, ĐśĐ°ĐşŃ.',
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
    expect(documentScene.blocks.map((block) => block.kind)).toEqual(['text', 'dialogue', 'dialogue', 'text']);
    expect(documentScene.blocks.at(-1)).toMatchObject({ kind: 'text', content: '' });
  });
});
