import {
  AI_EDITOR_CONTEXT_LIMITS,
  aiEditorContextSchema,
  parseAiEditorContext,
} from '@/lib/ai/editor-context';
import {
  buildAiEditorContext,
  resolveFocusedBlock,
  resolveSelectionAnchors,
  type CapturedSelection,
} from '@/lib/ai/editor-context-resolver';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { migrateCharacter } from '@/lib/character-migration';
import type { Character } from '@/lib/character-types';
import {
  createDocumentTechnicalBlock,
  documentSceneToTimeline,
  documentSceneToTimelineWithOrigins,
  sceneRecordToDocumentScene,
} from '@/lib/document-editor/document-scene';
import type { DocumentBlock, DocumentChoiceBlock, DocumentInlinePart, DocumentScene } from '@/lib/document-editor/types';
import { saveDocumentSceneToRecord } from '@/lib/document-scene-persistence';
import { createTextStep } from '@/lib/engine/event-factory';
import type { DialogueBlockData, SceneRecord, TextBlockData, TimelineStep } from '@/lib/engine/types';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateFocusedBlock } from '@/lib/vn-plate-editor/types';

function createSceneRecord(timeline: TimelineStep[] = []): SceneRecord {
  return {
    id: 'scene_1',
    storyId: 'story_1',
    name: 'Перша сцена',
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

const rain: DocumentInlinePart = {
  type: 'effect',
  id: 'fx_rain',
  effectType: 'rain',
  target: 'screen',
  intensity: 50,
  duration: 3,
};

/** What the editor's save does with a frame document: normalize, convert, store. */
function saveDocument(record: SceneRecord, document: DocumentScene, characters: Character[] = []): SceneRecord {
  const normalized = normalizePlateDocumentScene(document, characters);
  return saveDocumentSceneToRecord(record, normalized.scene, normalized.characters);
}

function documentOf(blocks: DocumentBlock[]): DocumentScene {
  return { sceneId: 'scene_1', sceneName: 'Перша сцена', blocks };
}

function contentOf(step: TimelineStep): string {
  return (step.data as TextBlockData).content;
}

describe('document step origins', () => {
  it('reports the pairing without changing the timeline it converts', () => {
    const document = documentOf([
      { id: 'blk_plain', kind: 'text', content: 'Тиша.' },
      {
        id: 'blk_chip',
        kind: 'text',
        content: 'Дощ почався. Він не вщухав.',
        parts: [{ type: 'text', text: 'Дощ почався. ' }, rain, { type: 'text', text: 'Він не вщухав.' }],
      },
      { id: 'blk_tail', kind: 'text', content: '' },
    ]);

    const { timeline, origins } = documentSceneToTimelineWithOrigins(document);
    const plain = documentSceneToTimeline(document);

    expect(timeline.map((step) => step.blockType)).toEqual(['text', 'text', 'effect', 'text']);
    expect(plain.map((step) => [step.blockType, step.blockType === 'text' ? contentOf(step) : null]))
      .toEqual(timeline.map((step) => [step.blockType, step.blockType === 'text' ? contentOf(step) : null]));
    expect(origins).toEqual([
      { stepId: timeline[0].id, blockId: 'blk_plain', partIndex: null, field: 'content' },
      { stepId: timeline[1].id, blockId: 'blk_chip', partIndex: 0, field: 'content' },
      { stepId: timeline[3].id, blockId: 'blk_chip', partIndex: 2, field: 'content' },
    ]);
  });

  it('keeps the id of a step that already exists and reports it', () => {
    const existing = createTextStep({ content: 'Було.' });
    const document = sceneRecordToDocumentScene(createSceneRecord([existing]));
    document.blocks[0] = { ...document.blocks[0], content: 'Стало.' } as DocumentBlock;

    const { timeline, origins } = documentSceneToTimelineWithOrigins(document);

    expect(timeline[0].id).toBe(existing.id);
    expect(contentOf(timeline[0])).toBe('Стало.');
    expect(origins).toEqual([{ stepId: existing.id, blockId: existing.id, partIndex: null, field: 'content' }]);
  });
});

describe('document block steps', () => {
  it('says which block or chip each step without text is, and leaves text to the origins', () => {
    const background = createDocumentTechnicalBlock('background');
    const choice: DocumentChoiceBlock = {
      id: 'blk_choice',
      kind: 'choice',
      question: '',
      options: [{ id: 'opt_1', text: 'Йти', targetSceneId: null }],
    };
    const document = documentOf([
      background,
      {
        id: 'blk_chip',
        kind: 'text',
        content: 'Дощ почався. Він не вщухав.',
        parts: [{ type: 'text', text: 'Дощ почався. ' }, rain, { type: 'text', text: 'Він не вщухав.' }],
      },
      choice,
    ]);

    const { timeline, origins, blockSteps } = documentSceneToTimelineWithOrigins(document);

    expect(timeline.map((step) => step.blockType)).toEqual(['background', 'text', 'effect', 'text', 'choice']);
    expect(blockSteps).toEqual([
      { stepId: timeline[0].id, blockId: background.id, partIndex: null },
      { stepId: timeline[2].id, blockId: 'blk_chip', partIndex: 1 },
      { stepId: timeline[4].id, blockId: 'blk_choice', partIndex: null },
    ]);
    expect(origins.map((origin) => origin.stepId)).toEqual([timeline[1].id, timeline[3].id]);
  });
});

describe('resolveFocusedBlock', () => {
  const focusOn = (id: string, extra: Partial<VNPlateFocusedBlock> = {}): VNPlateFocusedBlock => ({
    id,
    kind: 'technical',
    command: 'background',
    state: 'selected',
    ...extra,
  });

  it('names the stored step of a block loaded from the store', () => {
    const background = createDocumentTechnicalBlock('background');
    const scene = saveDocument(createSceneRecord(), documentOf([
      background,
      { id: 'blk_text', kind: 'text', content: 'Тиша.' },
    ]));
    const document = sceneRecordToDocumentScene(scene);
    const block = document.blocks.find((item) => item.kind === 'technical')!;

    const focus = resolveFocusedBlock({ scene, document, characters: [], focus: focusOn(block.id, { state: 'editing' }) });

    expect(focus).toMatchObject({
      sceneId: scene.id,
      blockType: 'background',
      stepId: scene.timeline[0].id,
      match: 'exact',
      state: 'editing',
    });
    expect(focus?.summary).toBeTruthy();
  });

  // What the step says as stored, so a change to its settings needs no read of
  // the scene first.
  it('brings the settings of the step it names', () => {
    const background = createDocumentTechnicalBlock('background');
    const scene = saveDocument(createSceneRecord(), documentOf([background, { id: 'blk_text', kind: 'text', content: 'Тиша.' }]));
    const document = sceneRecordToDocumentScene(scene);
    const block = document.blocks.find((item) => item.kind === 'technical')!;

    const focus = resolveFocusedBlock({ scene, document, characters: [], focus: focusOn(block.id) });

    expect(focus?.data).toEqual(scene.timeline[0].data);
    expect(parseAiEditorContext({
      version: 1, snapshotId: 's', kind: 'fixed', screen: 'editor', storyId: 'story_1', scene: null,
      hasUnsavedChanges: false, selection: null, focus, capturedAt: 1,
    }).ok).toBe(true);
  });

  it('leaves out settings too large to come with it, and still names the step', () => {
    const options = Array.from({ length: 30 }, (_, index) => ({ id: `opt_${index}`, text: 'Варіант, '.repeat(12), targetSceneId: null }));
    const choice: DocumentChoiceBlock = { id: 'blk_choice', kind: 'choice', question: 'Куди?', options };
    const scene = saveDocument(createSceneRecord(), documentOf([choice]));
    const document = sceneRecordToDocumentScene(scene);
    const block = document.blocks.find((item) => item.kind === 'choice')!;

    const focus = resolveFocusedBlock({ scene, document, characters: [], focus: { id: block.id, kind: 'choice', command: 'choice', state: 'selected' } });

    expect(JSON.stringify(scene.timeline[0].data).length).toBeGreaterThan(AI_EDITOR_CONTEXT_LIMITS.focusData);
    expect(focus).toMatchObject({ blockType: 'choice', match: 'exact', stepId: scene.timeline[0].id });
    expect(focus).not.toHaveProperty('data');
  });

  it('names the step an inline chip became', () => {
    const document = documentOf([{
      id: 'blk_chip',
      kind: 'text',
      content: 'Дощ почався. Він не вщухав.',
      parts: [{ type: 'text', text: 'Дощ почався. ' }, rain, { type: 'text', text: 'Він не вщухав.' }],
    }]);
    const scene = saveDocument(createSceneRecord(), document);

    const focus = resolveFocusedBlock({
      scene,
      document,
      characters: [],
      focus: { id: 'blk_chip', kind: 'text', command: 'effect', partIndex: 1, state: 'editing' },
    });

    expect(focus).toMatchObject({ blockType: 'effect', match: 'exact', summary: 'rain' });
    expect(scene.timeline.find((step) => step.id === focus?.stepId)?.blockType).toBe('effect');
  });

  // The author typed elsewhere and has not saved: the document no longer lines
  // up with the stored scene, but the block still carries its step's id.
  it('still names the step when the rest of the document has moved on', () => {
    const background = createDocumentTechnicalBlock('background');
    const scene = saveDocument(createSceneRecord(), documentOf([
      background,
      { id: 'blk_text', kind: 'text', content: 'Тиша.' },
    ]));
    const document = sceneRecordToDocumentScene(scene);
    const edited = documentOf(document.blocks.map((block) =>
      (block.kind === 'text' && block.content ? { ...block, content: 'Тиша. І кроки.' } : block)));
    const block = edited.blocks.find((item) => item.kind === 'technical')!;

    const focus = resolveFocusedBlock({ scene, document: edited, characters: [], focus: focusOn(block.id) });

    expect(focus).toMatchObject({ stepId: scene.timeline[0].id, match: 'exact' });
  });

  it('names no step once the block is gone from the stored scene', () => {
    const background = createDocumentTechnicalBlock('background');
    const document = documentOf([background, { id: 'blk_text', kind: 'text', content: 'Тиша.' }]);
    const scene = saveDocument(createSceneRecord(), documentOf([{ id: 'blk_text', kind: 'text', content: 'Тиша.' }]));

    const focus = resolveFocusedBlock({ scene, document, characters: [], focus: focusOn(background.id) });

    expect(focus).toMatchObject({ blockType: 'background', stepId: null, match: 'none' });
    expect(focus).not.toHaveProperty('data');
  });

  it('does not take a step of another kind for the block, whatever its id', () => {
    const background = createDocumentTechnicalBlock('background');
    const impostor = { ...createTextStep({ content: 'Тиша.' }), id: background.step.id };
    const scene = createSceneRecord([impostor, createTextStep({ content: 'Кроки.' })]);

    const focus = resolveFocusedBlock({
      scene,
      document: documentOf([background]),
      characters: [],
      focus: focusOn(background.id),
    });

    expect(focus).toMatchObject({ blockType: 'background', stepId: null, match: 'none' });
  });

  // Place and kind line two blocks of one kind up with each other's steps;
  // only what a block carries, or holds, says which step is its own.
  describe('when a draft has moved blocks of one kind around', () => {
    const backgroundOf = (assetId: string) => {
      const block = createDocumentTechnicalBlock('background');
      return { ...block, step: { ...block.step, data: { ...block.step.data, assetId } } };
    };
    const savedPair = () => {
      const scene = saveDocument(createSceneRecord(), documentOf([backgroundOf('bg_forest'), backgroundOf('bg_cave')]));
      return { scene, document: sceneRecordToDocumentScene(scene) };
    };

    it('names the step a swapped block carries, not the one in its old place', () => {
      const { scene, document } = savedPair();
      const [forest, cave] = document.blocks;
      const swapped = documentOf([cave, forest, ...document.blocks.slice(2)]);

      const focus = resolveFocusedBlock({ scene, document: swapped, characters: [], focus: focusOn(cave.id) });

      expect(focus).toMatchObject({ stepId: scene.timeline[1].id, match: 'exact' });
      expect(resolveFocusedBlock({ scene, document: swapped, characters: [], focus: focusOn(forest.id) }))
        .toMatchObject({ stepId: scene.timeline[0].id, match: 'exact' });
    });

    it('names no step for a block put where a deleted one of its kind was', () => {
      const { scene, document } = savedPair();
      const added = backgroundOf('bg_shore');
      const replaced = documentOf([added, ...document.blocks.slice(1)]);

      const focus = resolveFocusedBlock({ scene, document: replaced, characters: [], focus: focusOn(added.id) });

      expect(focus).toMatchObject({ blockType: 'background', stepId: null, match: 'none' });
    });

    // The same place, the same kind, the same settings — and a step id of its
    // own that the store has never seen, which is what says it is not saved.
    it('names no step for a new block with the same settings as the deleted one it replaced', () => {
      const { scene, document } = savedPair();
      const added = backgroundOf('bg_forest');
      const replaced = documentOf([added, ...document.blocks.slice(1)]);

      const focus = resolveFocusedBlock({ scene, document: replaced, characters: [], focus: focusOn(added.id) });

      expect(focus).toMatchObject({ blockType: 'background', stepId: null, match: 'none' });
    });

    // The second block is still there, carrying its id; a copy of it added in
    // the first one's place holds the same settings and is still not it.
    it('does not give a new block the step another block carries', () => {
      const scene = saveDocument(createSceneRecord(), documentOf([backgroundOf('bg_forest'), backgroundOf('bg_forest')]));
      const document = sceneRecordToDocumentScene(scene);
      const added = backgroundOf('bg_forest');
      const moved = documentOf([document.blocks[1], added, ...document.blocks.slice(2)]);

      expect(resolveFocusedBlock({ scene, document: moved, characters: [], focus: focusOn(added.id) }))
        .toMatchObject({ stepId: null, match: 'none' });
      expect(resolveFocusedBlock({ scene, document: moved, characters: [], focus: focusOn(document.blocks[1].id) }))
        .toMatchObject({ stepId: scene.timeline[1].id, match: 'exact' });
    });
  });

  // A block the frame made this session comes without a step, and gets a new
  // step id from every conversion: its place and its content are all that tie
  // it to what the save stored.
  const stepless = (commandId: string) => documentOf([
    { id: 'blk_text', kind: 'text', content: 'Тиша.' },
    { id: 'doc_block_new', kind: 'technical', commandId, blockType: commandId, label: commandId, summary: '', step: null } as unknown as DocumentBlock,
  ]);

  it.each(['background', 'video', 'music', 'sound', 'transition', 'variable', 'effect', 'camera', 'label', 'goto', 'stopEffect'] as const)(
    'follows a %s block made in this session to the step the save gave it',
    (commandId) => {
      const document = stepless(commandId);
      const scene = saveDocument(createSceneRecord(), document);

      const focus = resolveFocusedBlock({ scene, document, characters: [], focus: focusOn('doc_block_new', { command: commandId }) });

      expect(scene.timeline).toHaveLength(2);
      expect(focus).toMatchObject({ stepId: scene.timeline[1].id, match: 'exact' });
    },
  );

  // An interactive object is given a new object id by every conversion, so two
  // conversions of a stepless one never agree. The frame always sends its step;
  // this is what happens to a block that cannot be shown to be the stored one.
  it('names no step for a stepless block whose content the save cannot be matched to', () => {
    const document = stepless('interactive_object');
    const scene = saveDocument(createSceneRecord(), document);

    const focus = resolveFocusedBlock({ scene, document, characters: [], focus: focusOn('doc_block_new', { command: 'interactive_object' }) });

    expect(focus).toMatchObject({ blockType: 'interactive_object', stepId: null, match: 'none' });
  });

  it('follows a choice made in this session to the step the save gave it', () => {
    const choice: DocumentChoiceBlock = {
      id: 'doc_choice_new',
      kind: 'choice',
      question: '',
      options: [{ id: 'opt_1', text: 'Йти', targetSceneId: null }, { id: 'opt_2', text: 'Лишитись', targetSceneId: null }],
    };
    const document = documentOf([{ id: 'blk_text', kind: 'text', content: 'Тиша.' }, choice]);
    const scene = saveDocument(createSceneRecord(), document);

    const focus = resolveFocusedBlock({
      scene, document, characters: [], focus: { id: 'doc_choice_new', kind: 'choice', command: 'choice', state: 'editing' },
    });

    expect(focus).toMatchObject({ blockType: 'choice', stepId: scene.timeline[1].id, match: 'exact' });
  });

  it('names no step for a new choice that reads like the deleted one it replaced', () => {
    const choiceOf = (id: string): DocumentChoiceBlock => ({
      id,
      kind: 'choice',
      question: '',
      options: [{ id: `${id}_go`, text: 'Йти', targetSceneId: null }, { id: `${id}_stay`, text: 'Лишитись', targetSceneId: null }],
    });
    const scene = saveDocument(createSceneRecord(), documentOf([choiceOf('doc_choice_old')]));
    const replaced = documentOf([choiceOf('doc_choice_new')]);

    const focus = resolveFocusedBlock({
      scene, document: replaced, characters: [], focus: { id: 'doc_choice_new', kind: 'choice', command: 'choice', state: 'selected' },
    });

    expect(focus).toMatchObject({ blockType: 'choice', stepId: null, match: 'none' });
  });

  // With work the store does not have, the document and the scene are two
  // things: a block is its step only if it holds that step's id.
  describe('when the editor has unsaved changes', () => {
    it('names no step for a block that holds no id of its own, wherever it sits', () => {
      const document = stepless('label');
      const scene = saveDocument(createSceneRecord(), document);
      const focus = focusOn('doc_block_new', { command: 'label' });

      expect(resolveFocusedBlock({ scene, document, characters: [], focus })).toMatchObject({ match: 'exact' });
      expect(resolveFocusedBlock({ scene, document, characters: [], focus, hasUnsavedChanges: true }))
        .toMatchObject({ blockType: 'label', stepId: null, match: 'none' });
    });

    it('still names the step of a block that holds its id', () => {
      const scene = saveDocument(createSceneRecord(), documentOf([createDocumentTechnicalBlock('background')]));
      const document = sceneRecordToDocumentScene(scene);

      const focus = resolveFocusedBlock({
        scene, document, characters: [], focus: focusOn(document.blocks[0].id), hasUnsavedChanges: true,
      });

      expect(focus).toMatchObject({ stepId: scene.timeline[0].id, match: 'exact' });
    });
  });

  describe('when the frame could not answer', () => {
    const background = createDocumentTechnicalBlock('background');
    const scene = saveDocument(createSceneRecord(), documentOf([background]));

    it('goes by the id a stored block shares with its step', () => {
      const focus = resolveFocusedBlock({ scene, document: null, characters: [], focus: focusOn(scene.timeline[0].id) });

      expect(focus).toMatchObject({ blockType: 'background', stepId: scene.timeline[0].id, match: 'exact' });
      expect(focus).not.toHaveProperty('summary');
    });

    it('falls back to the editor’s own name for a block it cannot place', () => {
      const focus = resolveFocusedBlock({
        scene,
        document: null,
        characters: [],
        focus: focusOn('doc_block_unsaved', { command: 'goto' }),
      });

      expect(focus).toEqual({ sceneId: scene.id, blockType: 'goto', stepId: null, match: 'none', state: 'selected' });
    });
  });

  it('has nothing to say without a focus', () => {
    expect(resolveFocusedBlock({ scene: createSceneRecord(), document: null, characters: [], focus: undefined })).toBeNull();
  });
});

describe('resolveSelectionAnchors', () => {
  it('pairs a plain block with its stored step', () => {
    const first = createTextStep({ content: 'Перший абзац.' });
    const second = createTextStep({ content: 'Другий абзац.' });
    const scene = createSceneRecord([first, second]);

    const anchors = resolveSelectionAnchors({
      scene,
      document: sceneRecordToDocumentScene(scene),
      characters: [],
      blocks: [{ id: second.id, kind: 'text', quote: 'Другий', occurrence: 0 }],
    });

    expect(anchors).toEqual([
      { stepId: second.id, blockKind: 'text', field: 'content', quote: 'Другий', occurrence: 0, match: 'exact' },
    ]);
  });

  it('follows a block typed in this session to the step the save gave it', () => {
    const existing = createTextStep({ content: 'Старий абзац.' });
    const record = createSceneRecord([existing]);
    const document = sceneRecordToDocumentScene(record);
    document.blocks.splice(1, 0, { id: 'doc_text_new', kind: 'text', content: 'Новий абзац.' });
    const scene = saveDocument(record, document);

    const anchors = resolveSelectionAnchors({
      scene,
      document,
      characters: [],
      blocks: [{ id: 'doc_text_new', kind: 'text', quote: 'Новий', occurrence: 0 }],
    });

    expect(scene.timeline).toHaveLength(2);
    expect(scene.timeline[1].id).not.toBe('doc_text_new');
    expect(anchors[0]).toMatchObject({ stepId: scene.timeline[1].id, match: 'exact' });
  });

  it('gives every text part of a chip block its own step and its own quote', () => {
    const document = documentOf([
      {
        id: 'blk_chip',
        kind: 'text',
        content: 'Дощ почався. Він не вщухав.',
        parts: [{ type: 'text', text: 'Дощ почався. ' }, rain, { type: 'text', text: 'Він не вщухав.' }],
      },
    ]);
    const scene = saveDocument(createSceneRecord(), document);

    const anchors = resolveSelectionAnchors({
      scene,
      document,
      characters: [],
      blocks: [{
        id: 'blk_chip',
        kind: 'text',
        quote: 'почався. Він',
        occurrence: 0,
        parts: [
          { index: 0, quote: 'почався. ', occurrence: 0 },
          { index: 2, quote: 'Він', occurrence: 0 },
        ],
      }],
    });

    expect(scene.timeline.map((step) => step.blockType)).toEqual(['text', 'effect', 'text']);
    expect(anchors).toEqual([
      { stepId: scene.timeline[0].id, blockKind: 'text', field: 'content', quote: 'почався. ', occurrence: 0, match: 'exact' },
      { stepId: scene.timeline[2].id, blockKind: 'text', field: 'content', quote: 'Він', occurrence: 0, match: 'exact' },
    ]);
  });

  it('survives the chip block getting fresh step ids on the next save', () => {
    const document = documentOf([
      {
        id: 'blk_chip',
        kind: 'text',
        content: 'Дощ почався. Він не вщухав.',
        parts: [{ type: 'text', text: 'Дощ почався. ' }, rain, { type: 'text', text: 'Він не вщухав.' }],
      },
    ]);
    const firstSave = saveDocument(createSceneRecord(), document);
    const secondSave = saveDocument(firstSave, document);
    const block = {
      id: 'blk_chip',
      kind: 'text' as const,
      quote: 'Він',
      occurrence: 0,
      parts: [{ index: 2, quote: 'Він', occurrence: 0 }],
    };

    expect(secondSave.timeline[2].id).not.toBe(firstSave.timeline[2].id);
    expect(resolveSelectionAnchors({ scene: secondSave, document, characters: [], blocks: [block] })[0])
      .toMatchObject({ stepId: secondSave.timeline[2].id, match: 'exact' });
  });

  it('names the dialogue entry that holds the text', () => {
    const hero = migrateCharacter({ id: 'char_hero', name: 'Мира', sprites: [], createdAt: 1 });
    const document = documentOf([
      {
        id: 'doc_dialogue_new',
        kind: 'dialogue',
        speakerName: 'Мира',
        characterId: hero.id,
        spriteId: null,
        text: 'Ти чуєш це?',
      },
    ]);
    const scene = saveDocument(createSceneRecord(), document, [hero]);
    const dialogue = scene.timeline.find((step) => step.blockType === 'dialogue');

    const anchors = resolveSelectionAnchors({
      scene,
      document,
      characters: [hero],
      blocks: [{ id: 'doc_dialogue_new', kind: 'dialogue', quote: 'чуєш', occurrence: 0 }],
    });

    expect(dialogue).toBeDefined();
    expect(anchors).toEqual([{
      stepId: dialogue?.id,
      blockKind: 'dialogue',
      field: 'entryText',
      entryId: (dialogue?.data as DialogueBlockData).entries[0].id,
      quote: 'чуєш',
      occurrence: 0,
      match: 'exact',
    }]);
  });

  it('carries the occurrence of a phrase repeated inside one step', () => {
    const step = createTextStep({ content: 'Крок, ще крок, і ще крок.' });
    const scene = createSceneRecord([step]);

    const anchors = resolveSelectionAnchors({
      scene,
      document: sceneRecordToDocumentScene(scene),
      characters: [],
      blocks: [{ id: step.id, kind: 'text', quote: 'крок', occurrence: 1 }],
    });

    expect(anchors[0]).toMatchObject({ stepId: step.id, occurrence: 1, match: 'exact' });
  });

  // Two paragraphs that read the same and have traded places line up by place
  // and by text; each still carries the id of its own step.
  it('does not address a line to the step of its twin after they traded places', () => {
    const first = createTextStep({ content: 'Тиша.' });
    const second = createTextStep({ content: 'Тиша.' });
    const scene = createSceneRecord([first, second]);
    const document = sceneRecordToDocumentScene(scene);
    const swapped = documentOf([document.blocks[1], document.blocks[0], ...document.blocks.slice(2)]);

    const anchors = resolveSelectionAnchors({
      scene,
      document: swapped,
      characters: [],
      blocks: [{ id: second.id, kind: 'text', quote: 'Тиша', occurrence: 0 }],
    });

    expect(anchors[0]).toMatchObject({ stepId: null, match: 'ambiguous' });
  });

  // A paragraph typed this session holds no step id, so only its place ties it
  // to a step — and a place is worth nothing while the editor has unsaved work.
  it('finds a line typed this session by its words, not its place, while changes are unsaved', () => {
    const existing = createTextStep({ content: 'Старий абзац.' });
    const record = createSceneRecord([existing]);
    const document = sceneRecordToDocumentScene(record);
    document.blocks.splice(1, 0, { id: 'doc_text_new', kind: 'text', content: 'Новий абзац.' });
    const scene = saveDocument(record, document);

    const anchors = resolveSelectionAnchors({
      scene,
      document,
      characters: [],
      hasUnsavedChanges: true,
      blocks: [
        { id: 'doc_text_new', kind: 'text', quote: 'Новий', occurrence: 0 },
        { id: existing.id, kind: 'text', quote: 'Старий', occurrence: 0 },
      ],
    });

    expect(anchors[0]).toMatchObject({ stepId: scene.timeline[1].id, match: 'quote' });
    expect(anchors[1]).toMatchObject({ stepId: existing.id, match: 'exact' });
  });

  describe('when the stored scene is not the captured document', () => {
    const first = createTextStep({ content: 'Старі двері були зачинені.' });
    const second = createTextStep({ content: 'Вона постукала у двері.' });
    const captured = sceneRecordToDocumentScene(createSceneRecord([first, second]));
    const moved = createSceneRecord([
      first,
      createTextStep({ content: 'Нова вставка.' }),
      second,
    ]);

    it('finds a unique phrase by its text and does not call it exact', () => {
      const anchors = resolveSelectionAnchors({
        scene: moved,
        document: captured,
        characters: [],
        blocks: [{ id: second.id, kind: 'text', quote: 'постукала', occurrence: 0 }],
      });

      expect(anchors[0]).toMatchObject({ stepId: second.id, match: 'quote' });
    });

    it('names no step for a phrase that appears in more than one', () => {
      const anchors = resolveSelectionAnchors({
        scene: moved,
        document: captured,
        characters: [],
        blocks: [{ id: second.id, kind: 'text', quote: 'двері', occurrence: 0 }],
      });

      expect(anchors[0]).toMatchObject({ stepId: null, match: 'ambiguous' });
    });

    it('names no step for a phrase that is gone', () => {
      const anchors = resolveSelectionAnchors({
        scene: moved,
        document: captured,
        characters: [],
        blocks: [{ id: second.id, kind: 'text', quote: 'вікно', occurrence: 0 }],
      });

      expect(anchors[0]).toMatchObject({ stepId: null, match: 'none' });
    });
  });

  it('never reports exact when the frame could not answer', () => {
    const step = createTextStep({ content: 'Єдиний абзац.' });

    const anchors = resolveSelectionAnchors({
      scene: createSceneRecord([step]),
      document: null,
      characters: [],
      blocks: [{ id: step.id, kind: 'text', quote: 'Єдиний', occurrence: 0 }],
    });

    expect(anchors[0]).toMatchObject({ stepId: step.id, match: 'quote' });
  });

  it('finds a phrase the stored text wraps in markup', () => {
    const step = createTextStep({ content: 'Він **закричав** щосили.' });

    const anchors = resolveSelectionAnchors({
      scene: createSceneRecord([step]),
      document: null,
      characters: [],
      blocks: [{ id: 'unknown', kind: 'text', quote: 'закричав щосили', occurrence: 0 }],
    });

    expect(anchors[0]).toMatchObject({ stepId: step.id, match: 'quote' });
  });

  it('does not trust part numbers once normalization dropped a part', () => {
    const document = documentOf([
      {
        id: 'blk_chip',
        kind: 'text',
        content: 'Дощ почався. Він не вщухав.',
        parts: [
          { type: 'bogus' } as unknown as DocumentInlinePart,
          { type: 'text', text: 'Дощ почався. ' },
          rain,
          { type: 'text', text: 'Він не вщухав.' },
        ],
      },
    ]);
    const scene = saveDocument(createSceneRecord(), document);

    const anchors = resolveSelectionAnchors({
      scene,
      document,
      characters: [],
      blocks: [{
        id: 'blk_chip',
        kind: 'text',
        quote: 'Він',
        occurrence: 0,
        // Index 3 in the frame's numbering is index 2 after the drop.
        parts: [{ index: 3, quote: 'Він', occurrence: 0 }],
      }],
    });

    expect(anchors[0]).toMatchObject({ stepId: scene.timeline[2].id, match: 'quote' });
  });

  it('caps the number of anchors', () => {
    const steps = Array.from({ length: 30 }, (_, index) => createTextStep({ content: `Абзац ${index}.` }));
    const scene = createSceneRecord(steps);

    const anchors = resolveSelectionAnchors({
      scene,
      document: sceneRecordToDocumentScene(scene),
      characters: [],
      blocks: steps.map((step, index) => ({ id: step.id, kind: 'text' as const, quote: `Абзац ${index}.`, occurrence: 0 })),
    });

    expect(anchors).toHaveLength(AI_EDITOR_CONTEXT_LIMITS.anchors);
  });
});

describe('buildAiEditorContext', () => {
  const step = createTextStep({ content: 'Один абзац.' });
  const scene = createSceneRecord([step]);
  const selection: CapturedSelection = {
    sceneId: scene.id,
    collapsed: false,
    text: 'Один',
    textLength: 4,
    truncated: false,
    before: '',
    after: ' абзац.',
    crossesChip: false,
    blocks: [{ id: step.id, kind: 'text', quote: 'Один', occurrence: 0 }],
  };

  function build(overrides: Partial<Parameters<typeof buildAiEditorContext>[0]> = {}) {
    return buildAiEditorContext({
      snapshotId: 'snap_1',
      kind: 'fixed',
      storyId: 'story_1',
      scene,
      sceneSource: 'selection',
      hasUnsavedChanges: false,
      selection,
      anchors: resolveSelectionAnchors({
        scene,
        document: sceneRecordToDocumentScene(scene),
        characters: [],
        blocks: selection.blocks,
      }),
      capturedAt: 1_700_000_000_000,
      ...overrides,
    });
  }

  it('produces a context its own schema accepts, stamped with the scene revision', () => {
    const context = build();

    expect(aiEditorContextSchema.safeParse(context).success).toBe(true);
    expect(context.scene).toEqual({
      id: scene.id,
      name: scene.name,
      revision: computeSceneRevision(scene),
      source: 'selection',
    });
    expect(context.selection?.anchors[0]).toMatchObject({ stepId: step.id, match: 'exact' });
  });

  it('carries the block in focus next to the selection', () => {
    const focus = { sceneId: scene.id, blockType: 'background', stepId: 'step_bg', match: 'exact', state: 'editing' } as const;
    const context = build({ focus });

    expect(context.focus).toEqual(focus);
    expect(context.selection?.text).toBe('Один');
    expect(parseAiEditorContext(context).ok).toBe(true);
  });

  // A block clicked with no caret anywhere arrives as a state with no text and
  // no blocks: there is a focus to pass on, and no selection to speak of.
  it('reports no selection when only a block is in focus', () => {
    const focus = { sceneId: scene.id, blockType: 'choice', stepId: null, match: 'none', state: 'selected' } as const;
    const context = build({
      selection: { ...selection, collapsed: true, text: '', textLength: 0, after: '', blocks: [] },
      anchors: [],
      focus,
    });

    expect(context.selection).toBeNull();
    expect(context.focus).toEqual(focus);
    expect(parseAiEditorContext(context).ok).toBe(true);
  });

  it('describes a place with no selection', () => {
    const context = build({ selection: null, anchors: [], sceneSource: 'scroll' });

    expect(context.selection).toBeNull();
    expect(context.scene?.source).toBe('scroll');
    expect(parseAiEditorContext(context).ok).toBe(true);
  });

  it('clips a long selection and keeps the words nearest to it', () => {
    const context = build({
      selection: {
        ...selection,
        text: 'я'.repeat(AI_EDITOR_CONTEXT_LIMITS.selectionText + 50),
        textLength: AI_EDITOR_CONTEXT_LIMITS.selectionText + 50,
        before: `${'а'.repeat(400)}КІНЕЦЬ`,
        after: `ПОЧАТОК${'б'.repeat(400)}`,
      },
    });

    expect(context.selection?.text).toHaveLength(AI_EDITOR_CONTEXT_LIMITS.selectionText);
    expect(context.selection?.truncated).toBe(true);
    expect(context.selection?.textLength).toBe(AI_EDITOR_CONTEXT_LIMITS.selectionText + 50);
    expect(context.selection?.before.endsWith('КІНЕЦЬ')).toBe(true);
    expect(context.selection?.after.startsWith('ПОЧАТОК')).toBe(true);
    expect(context.selection?.before).toHaveLength(AI_EDITOR_CONTEXT_LIMITS.surroundingText);
  });

  function oversized(char: string) {
    const long = char.repeat(AI_EDITOR_CONTEXT_LIMITS.selectionText);
    return build({
      activePathSceneIds: Array.from({ length: 100 }, (_, index) => `scene_${index}`),
      selection: { ...selection, text: long, textLength: long.length },
      anchors: Array.from({ length: AI_EDITOR_CONTEXT_LIMITS.anchors }, () => ({
        stepId: step.id,
        blockKind: 'text' as const,
        field: 'content' as const,
        quote: long,
        occurrence: 0,
        match: 'exact' as const,
      })),
    });
  }

  it('fits the byte budget by shedding the path list and long quotes before the selection', () => {
    const context = oversized('щ');

    expect(parseAiEditorContext(context)).toEqual({ ok: true, context });
    expect(context.activePathSceneIds).toBeUndefined();
    expect(context.selection?.anchors).toHaveLength(AI_EDITOR_CONTEXT_LIMITS.anchors);
    expect(context.selection?.anchors[0]).toMatchObject({ stepId: step.id, match: 'exact' });
    expect(context.selection?.anchors[0].quote.length).toBeLessThan(AI_EDITOR_CONTEXT_LIMITS.selectionText);
    expect(context.selection?.text).toHaveLength(AI_EDITOR_CONTEXT_LIMITS.selectionText);
    expect(context.selection?.truncated).toBe(false);
  });

  it('shortens the selection itself only when nothing else is left to shed', () => {
    const context = oversized('語');

    expect(parseAiEditorContext(context)).toEqual({ ok: true, context });
    expect(context.selection?.text.length).toBeLessThan(AI_EDITOR_CONTEXT_LIMITS.selectionText);
    expect(context.selection?.truncated).toBe(true);
    expect(context.selection?.textLength).toBe(AI_EDITOR_CONTEXT_LIMITS.selectionText);
  });

  describe('with the settings of a block in focus', () => {
    const data = { note: 'ж'.repeat(1_700) };
    const focusIn = (state: 'selected' | 'editing') => ({ sceneId: scene.id, blockType: 'background', stepId: 'step_bg', match: 'exact', state, data } as const);
    const withFocus = (state: 'selected' | 'editing') => {
      const long = 'щ'.repeat(AI_EDITOR_CONTEXT_LIMITS.selectionText);
      return build({
        selection: { ...selection, text: long, textLength: long.length },
        anchors: Array.from({ length: AI_EDITOR_CONTEXT_LIMITS.anchors }, () => ({
          stepId: step.id, blockKind: 'text' as const, field: 'content' as const, quote: long, occurrence: 0, match: 'exact' as const,
        })),
        focus: focusIn(state),
      });
    };

    it('carries them when the context fits', () => {
      const context = build({ focus: focusIn('selected') });

      expect(context.focus?.data).toEqual(data);
      expect(parseAiEditorContext(context).ok).toBe(true);
    });

    // A block merely selected or used last comes after the text the author
    // selected; its step id still says where it is.
    it('sheds them before the selection when the block is only selected', () => {
      const context = withFocus('selected');

      expect(parseAiEditorContext(context)).toEqual({ ok: true, context });
      expect(context.focus).toMatchObject({ stepId: 'step_bg', match: 'exact' });
      expect(context.focus).not.toHaveProperty('data');
      expect(context.selection?.text).toHaveLength(AI_EDITOR_CONTEXT_LIMITS.selectionText);
      expect(context.selection?.truncated).toBe(false);
    });

    // A block whose settings are open is what the author is working on.
    it('keeps them and shortens the selection when the block’s settings are open', () => {
      const context = withFocus('editing');

      expect(parseAiEditorContext(context)).toEqual({ ok: true, context });
      expect(context.focus?.data).toEqual(data);
      expect(context.selection?.text.length).toBeLessThan(AI_EDITOR_CONTEXT_LIMITS.selectionText);
      expect(context.selection?.truncated).toBe(true);
    });
  });
});

describe('parseAiEditorContext', () => {
  const valid = {
    version: 1,
    snapshotId: 'snap_1',
    kind: 'live',
    screen: 'editor',
    storyId: 'story_1',
    scene: null,
    hasUnsavedChanges: true,
    selection: null,
    capturedAt: 1,
  };
  const anchor = { blockKind: 'text', field: 'content', quote: 'x', occurrence: 0 };
  const withAnchor = (extra: Record<string, unknown>) => ({
    ...valid,
    selection: {
      sceneId: 'scene_1',
      collapsed: false,
      text: 'x',
      textLength: 1,
      truncated: false,
      before: '',
      after: '',
      crossesChip: false,
      anchors: [{ ...anchor, ...extra }],
    },
  });

  it('accepts a minimal context', () => {
    expect(parseAiEditorContext(valid).ok).toBe(true);
  });

  it('rejects an exact anchor that names no step', () => {
    expect(parseAiEditorContext(withAnchor({ stepId: null, match: 'exact' }))).toEqual({ ok: false, reason: 'INVALID_SHAPE' });
  });

  it('rejects an unresolved anchor that names a step anyway', () => {
    expect(parseAiEditorContext(withAnchor({ stepId: 'step_1', match: 'ambiguous' }))).toEqual({ ok: false, reason: 'INVALID_SHAPE' });
  });

  const focus = { sceneId: 'scene_1', blockType: 'background', state: 'recent' };

  it('accepts a focus that names its step and one that names none', () => {
    expect(parseAiEditorContext({ ...valid, focus: { ...focus, stepId: 'step_1', match: 'exact' } }).ok).toBe(true);
    expect(parseAiEditorContext({ ...valid, focus: { ...focus, stepId: null, match: 'none' } }).ok).toBe(true);
  });

  it('rejects a focus whose match and step disagree', () => {
    expect(parseAiEditorContext({ ...valid, focus: { ...focus, stepId: null, match: 'exact' } }))
      .toEqual({ ok: false, reason: 'INVALID_SHAPE' });
    expect(parseAiEditorContext({ ...valid, focus: { ...focus, stepId: 'step_1', match: 'none' } }))
      .toEqual({ ok: false, reason: 'INVALID_SHAPE' });
  });

  it('accepts the settings of a step a focus names, and none for a focus that names no step', () => {
    expect(parseAiEditorContext({ ...valid, focus: { ...focus, stepId: 'step_1', match: 'exact', data: { assetId: null } } }).ok).toBe(true);
    expect(parseAiEditorContext({ ...valid, focus: { ...focus, stepId: null, match: 'none', data: { assetId: null } } }))
      .toEqual({ ok: false, reason: 'INVALID_SHAPE' });
  });

  it('rejects settings larger than a focus may carry', () => {
    const data = { note: 'x'.repeat(AI_EDITOR_CONTEXT_LIMITS.focusData) };

    expect(parseAiEditorContext({ ...valid, focus: { ...focus, stepId: 'step_1', match: 'exact', data } }))
      .toEqual({ ok: false, reason: 'INVALID_SHAPE' });
  });

  it('rejects a focus in a state it does not know', () => {
    expect(parseAiEditorContext({ ...valid, focus: { ...focus, stepId: null, match: 'none', state: 'hovered' } }))
      .toEqual({ ok: false, reason: 'INVALID_SHAPE' });
  });

  it('rejects a well-formed context that is too large', () => {
    const oversized = { ...valid, activePathSceneIds: Array.from({ length: 100 }, () => 'с'.repeat(200)) };

    expect(parseAiEditorContext(oversized)).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('rejects an unknown screen', () => {
    expect(parseAiEditorContext({ ...valid, screen: 'reader' })).toEqual({ ok: false, reason: 'INVALID_SHAPE' });
  });
});
