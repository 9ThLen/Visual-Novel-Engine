import {
  AI_EDITOR_CONTEXT_LIMITS,
  aiEditorContextSchema,
  parseAiEditorContext,
} from '@/lib/ai/editor-context';
import {
  buildAiEditorContext,
  resolveSelectionAnchors,
  type CapturedSelection,
} from '@/lib/ai/editor-context-resolver';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { migrateCharacter } from '@/lib/character-migration';
import type { Character } from '@/lib/character-types';
import {
  documentSceneToTimeline,
  documentSceneToTimelineWithOrigins,
  sceneRecordToDocumentScene,
} from '@/lib/document-editor/document-scene';
import type { DocumentBlock, DocumentInlinePart, DocumentScene } from '@/lib/document-editor/types';
import { saveDocumentSceneToRecord } from '@/lib/document-scene-persistence';
import { createTextStep } from '@/lib/engine/event-factory';
import type { DialogueBlockData, SceneRecord, TextBlockData, TimelineStep } from '@/lib/engine/types';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';

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

  it('rejects a well-formed context that is too large', () => {
    const oversized = { ...valid, activePathSceneIds: Array.from({ length: 100 }, () => 'с'.repeat(200)) };

    expect(parseAiEditorContext(oversized)).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('rejects an unknown screen', () => {
    expect(parseAiEditorContext({ ...valid, screen: 'reader' })).toEqual({ ok: false, reason: 'INVALID_SHAPE' });
  });
});
