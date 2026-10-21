import { applyAiScenePatch } from '@/lib/ai/scene-patch';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import {
  addressSentences,
  comicAnchor,
  parseComicAnchor,
  resolveComicAnchor,
  sentencePrint,
  splitSentences,
  type ComicAnchored,
} from '@/lib/comic/comic-anchors';
import { sceneRecordToDocumentScene } from '@/lib/document-editor/document-scene';
import { expandActivePath } from '@/lib/document-editor/story-path';
import type { DocumentBlock, DocumentInlinePart, DocumentScene } from '@/lib/document-editor/types';
import { saveDocumentSceneToRecord } from '@/lib/document-scene-persistence';
import { createBackgroundStep, createDialogueEntry, createDialogueStep } from '@/lib/engine/event-factory';
import type { DialogueBlockData, SceneRecord, TextBlockData, TimelineStep } from '@/lib/engine/types';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';

function emptyScene(timeline: TimelineStep[] = []): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
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

/** The editor's save: the document as the frame sends it, normalized and written over the scene. */
function save(scene: SceneRecord, blocks: DocumentBlock[]): SceneRecord {
  const document: DocumentScene = { sceneId: scene.id, sceneName: scene.name, blocks };
  const normalized = normalizePlateDocumentScene(document, []);
  return saveDocumentSceneToRecord(scene, normalized.scene, normalized.characters);
}

const reopen = (scene: SceneRecord) => sceneRecordToDocumentScene(scene).blocks;
/** Open the scene in the editor and save it with nothing changed. */
const cycle = (scene: SceneRecord) => save(scene, reopen(scene));
const anchorsOf = (scene: SceneRecord) => addressSentences(scene.timeline).map((sentence) => sentence.anchor);
const contentBlocks = (blocks: DocumentBlock[]) => blocks.filter((block) => !(block.kind === 'text' && !block.content.trim() && !block.parts?.length));

const rain: DocumentInlinePart = { type: 'effect', id: 'fx_rain', effectType: 'rain', target: 'screen', intensity: 50, duration: 3 };
const thunder: DocumentInlinePart = { type: 'sound', id: 'sfx_thunder', mode: 'track', assetId: null, volume: 0.8, loop: false, fadeIn: 0, fadeOut: 0.8, pitchVariation: 0, boundTo: 'continuous' };

describe('sentences as the comic counts them', () => {
  it('ends a sentence at its punctuation before a space, with the quotes that close it, and at a line break', () => {
    expect(splitSentences('One. Two! «Three?» Four… Five\nSix')).toEqual(['One.', 'Two!', '«Three?»', 'Four…', 'Five', 'Six']);
    expect(splitSentences('3.14 is not an end. Neither is v1.2')).toEqual(['3.14 is not an end.', 'Neither is v1.2']);
    expect(splitSentences('  ')).toEqual([]);
  });

  it('knows a sentence by its words, not by case, spacing or the kind of quote', () => {
    expect(sentencePrint('  «Ти  ПРИЙШОВ?»  ')).toBe(sentencePrint('"ти прийшов?"'));
    expect(sentencePrint("It’s late.")).toBe(sentencePrint("it's late."));
    expect(sentencePrint('One.')).not.toBe(sentencePrint('One!'));
  });

  it('reads an anchor back into its parts', () => {
    expect(parseComicAnchor(comicAnchor('doc_a/b', 2, 7))).toEqual({ blockId: 'doc_a/b', part: 2, sentence: 7 });
    expect(parseComicAnchor('not an anchor')).toBeNull();
  });

  it('numbers sentences across every dialogue entry without joining unfinished sentences', () => {
    const step = {
      ...createDialogueStep({ entries: [
        createDialogueEntry({ text: 'One. Two.' }),
        createDialogueEntry({ text: '' }),
        createDialogueEntry({ text: 'An unfinished line' }),
        createDialogueEntry({ text: 'Another line. Last.' }),
      ] }),
      originBlockId: 'doc_dialogue',
      originPart: 2,
    };
    const sentences = addressSentences([step]);

    expect(sentences.map(({ text, anchor }) => [text, anchor])).toEqual([
      ['One.', 'doc_dialogue/p2/s0'], ['Two.', 'doc_dialogue/p2/s1'],
      ['An unfinished line', 'doc_dialogue/p2/s2'],
      ['Another line.', 'doc_dialogue/p2/s3'], ['Last.', 'doc_dialogue/p2/s4'],
    ]);
    expect(new Set(sentences.map(({ anchor }) => anchor)).size).toBe(sentences.length);
    expect(resolveComicAnchor(sentences[4], sentences)).toEqual({ status: 'bound', anchor: 'doc_dialogue/p2/s4' });
    const { originBlockId: _block, originPart: _part, ...legacy } = step;
    expect(addressSentences([legacy]).at(-1)?.anchor).toBe(`${step.id}/p0/s4`);
  });
});

describe('a block keeps its id from one save to the next', () => {
  it('for a line typed this session, saved as a step with an id of its own', () => {
    const first = save(emptyScene(), [{ id: 'doc_a', kind: 'text', content: 'One. Two.' }]);

    expect(first.timeline[0]).toMatchObject({ originBlockId: 'doc_a' });
    expect(first.timeline[0].id).not.toBe('doc_a');
    expect(contentBlocks(reopen(first)).map((block) => block.id)).toEqual(['doc_a']);
    const second = cycle(first);
    expect(second.timeline).toEqual(first.timeline);
    expect(anchorsOf(second)).toEqual(['doc_a/p0/s0', 'doc_a/p0/s1']);
  });

  // Each run of text beside a chip is saved as a new step every time, so
  // nothing but the block id stays.
  it('for a line with inline chips, whose text is saved as new steps each time', () => {
    const first = save(emptyScene(), [{
      id: 'doc_rain',
      kind: 'text',
      content: 'Rain began. It did not stop.',
      parts: [{ type: 'text', text: 'Rain began. ' }, rain, { type: 'text', text: 'It did not stop.' }],
    }]);
    const second = cycle(first);
    const third = cycle(second);

    expect(first.timeline.map((step) => [step.blockType, step.originBlockId, step.originPart])).toEqual([
      ['text', 'doc_rain', 0], ['effect', 'doc_rain', 1], ['text', 'doc_rain', 2],
    ]);
    expect(second.timeline[0].id).not.toBe(first.timeline[0].id);
    const [reopened] = contentBlocks(reopen(second));
    expect(reopened).toMatchObject({ id: 'doc_rain', kind: 'text', content: 'Rain began. It did not stop.' });
    expect(reopened.kind === 'text' && reopened.parts?.map((part) => part.type)).toEqual(['text', 'effect', 'text']);
    expect(anchorsOf(third)).toEqual(['doc_rain/p0/s0', 'doc_rain/p2/s0']);
    expect(anchorsOf(second)).toEqual(anchorsOf(first));
  });

  // Opening used to fold every run of text and chips into one line.
  it('keeps two blocks apart when opening, whatever lies between them', () => {
    const scene = save(emptyScene(), [
      { id: 'doc_plain', kind: 'text', content: 'Plain line.' },
      { id: 'doc_chips', kind: 'text', content: 'Rain began.', parts: [rain, { type: 'text', text: 'Rain began.' }] },
    ]);

    expect(contentBlocks(reopen(scene)).map((block) => block.id)).toEqual(['doc_plain', 'doc_chips']);
    expect(anchorsOf(cycle(scene))).toEqual(['doc_plain/p0/s0', 'doc_chips/p1/s0']);
  });

  it('still folds a run of text and chips saved before blocks were remembered, as it always did', () => {
    const legacy = emptyScene([
      { id: 'step_a', blockType: 'text', data: { content: 'Rain began. ', typewriterSpeed: 30, anchorTo: 'background' }, collapsed: false, enabled: true },
      { id: 'fx_rain', blockType: 'effect', data: { effectType: 'rain', target: 'screen', intensity: 50, duration: 3 }, collapsed: false, enabled: true },
      { id: 'step_b', blockType: 'text', data: { content: 'It did not stop.', typewriterSpeed: 30, anchorTo: 'background' }, collapsed: false, enabled: true },
    ] as TimelineStep[]);

    const blocks = contentBlocks(reopen(legacy));

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: 'step_a', content: 'Rain began. It did not stop.' });
  });

  // The frame finds a choice's branch by its block's id, the story by its step's.
  it('for a choice added this session, saved under the id its branch is known by', () => {
    const choice: DocumentBlock = {
      id: 'doc_choice_new',
      kind: 'choice',
      question: 'Choice',
      options: [{ id: 'opt-a', text: 'Left', targetSceneId: 'scene-a' }, { id: 'opt-b', text: 'Right', targetSceneId: null }],
    };
    const first = save(emptyScene(), [choice]);
    const target = { ...emptyScene(), id: 'scene-a', isStart: false };

    expect(Object.keys(expandActivePath([first, target]).branchInfoByChoiceStepId)).toEqual(['doc_choice_new']);
    expect(contentBlocks(reopen(first)).map((block) => block.id)).toEqual(['doc_choice_new']);
    expect(cycle(first).timeline).toEqual(first.timeline);
  });

  it('for a pasted copy: the copy has its own id, and the sentences of each are its own', () => {
    const scene = save(emptyScene(), [
      { id: 'doc_a', kind: 'text', content: 'The door creaked.' },
      { id: 'doc_copy', kind: 'text', content: 'The door creaked.' },
    ]);

    expect(anchorsOf(cycle(scene))).toEqual(['doc_a/p0/s0', 'doc_copy/p0/s0']);
  });

  it('for a step the assistant replaced or changed', () => {
    const scene = save(emptyScene(), [{ id: 'doc_a', kind: 'text', content: 'Old words.' }]);
    const [step] = scene.timeline;
    const patch = (operation: Parameters<typeof applyAiScenePatch>[1]['operations'][number]) => applyAiScenePatch(scene, {
      storyId: scene.storyId, sceneId: scene.id, expectedRevision: computeSceneRevision(scene), explanation: '', operations: [operation],
    });
    // The assistant's step comes through a schema that knows nothing of origins.
    const { originBlockId: _origin, ...bare } = step;

    const replaced = patch({ op: 'replace_step', stepId: step.id, step: { ...bare, data: { ...(step.data as TextBlockData), content: 'New words.' } } });
    const updated = patch({ op: 'update_step', stepId: step.id, data: { content: 'New words.' } });

    for (const after of [replaced, updated]) {
      expect(contentBlocks(reopen(after)).map((block) => block.id)).toEqual(['doc_a']);
      expect(anchorsOf(cycle(after))).toEqual(['doc_a/p0/s0']);
    }
  });

  describe('for a step the assistant replaced with a step of another id', () => {
    const replace = (scene: SceneRecord, stepId: string, step: TimelineStep) => applyAiScenePatch(scene, {
      storyId: scene.storyId, sceneId: scene.id, expectedRevision: computeSceneRevision(scene), explanation: '', operations: [{ op: 'replace_step', stepId, step }],
    });
    const text = (id: string, content: string) => ({ id, blockType: 'text', data: { content, typewriterSpeed: 30, anchorTo: 'background' }, collapsed: false, enabled: true }) as TimelineStep;

    it('keeps a block saved this session', () => {
      const scene = save(emptyScene(), [{ id: 'doc_a', kind: 'text', content: 'Old words.' }]);

      const after = replace(scene, scene.timeline[0].id, text('ai-step-1', 'New words.'));

      expect(contentBlocks(reopen(after)).map((block) => block.id)).toEqual(['doc_a']);
      expect(anchorsOf(cycle(after))).toEqual(['doc_a/p0/s0']);
    });

    // Saved before blocks were remembered, the block opened under the step's own id.
    it('keeps a block that opened under the step it replaced', () => {
      const scene = emptyScene([text('step_a', 'Old words.'), text('step_b', 'Next line.')]);

      const after = replace(scene, 'step_a', text('ai-step-1', 'New words.'));

      expect(contentBlocks(reopen(after)).map((block) => block.id)).toEqual(['step_a', 'step_b']);
      expect(anchorsOf(cycle(after))).toEqual(['step_a/p0/s0', 'step_b/p0/s0']);
    });

    it('keeps a line of text and chips saved before blocks were remembered, whichever of its steps it was', () => {
      const scene = emptyScene([
        text('step_a', 'Rain began. '),
        { id: 'fx_rain', blockType: 'effect', data: { effectType: 'rain', target: 'screen', intensity: 50, duration: 3 }, collapsed: false, enabled: true } as TimelineStep,
        text('step_b', 'It did not stop.'),
      ]);

      for (const after of [replace(scene, 'step_a', text('ai-step-1', 'Rain fell. ')), replace(scene, 'step_b', text('ai-step-2', 'It went on.'))]) {
        const blocks = contentBlocks(reopen(after));
        expect(blocks.map((block) => block.id)).toEqual(['step_a']);
        expect(blocks[0].kind === 'text' && blocks[0].parts?.map((part) => part.type)).toEqual(['text', 'effect', 'text']);
        expect(anchorsOf(cycle(after))).toEqual(['step_a/p0/s0', 'step_a/p2/s0']);
      }
    });

    // The frame finds a choice's branch by its block's id, the story by its step's.
    it('opens a choice under the step that replaced it', () => {
      const choice = (id: string) => ({ id, blockType: 'choice', data: { options: [{ id: 'opt-a', text: 'Left', targetSceneId: null }] }, collapsed: false, enabled: true }) as TimelineStep;

      const after = replace(emptyScene([choice('step_choice')]), 'step_choice', choice('ai-choice-1'));

      expect(contentBlocks(reopen(after)).map((block) => block.id)).toEqual(['ai-choice-1']);
    });
  });

  it('for a line of dialogue with an inline chip, put back together as one line', () => {
    const dialogue: DocumentBlock = {
      id: 'doc_says',
      kind: 'dialogue',
      speakerName: 'Mira',
      characterId: 'char-mira',
      spriteId: null,
      text: 'Listen. It stopped.',
      parts: [{ type: 'text', text: 'Listen. ' }, thunder, { type: 'text', text: 'It stopped.' }],
    };
    const first = save(emptyScene(), [dialogue]);

    const [reopened] = contentBlocks(reopen(first)).filter((block) => block.kind === 'dialogue');

    expect(reopened).toMatchObject({ id: 'doc_says', kind: 'dialogue', characterId: 'char-mira', text: 'Listen. It stopped.' });
    expect(reopened.kind === 'dialogue' && reopened.parts?.map((part) => part.type)).toEqual(['text', 'sound', 'text']);
    expect(anchorsOf(cycle(first))).toEqual(anchorsOf(first));
    expect(anchorsOf(first)).toEqual(['doc_says/p0/s0', 'doc_says/p2/s0']);
  });

  // Spaces alone between two chips are not saved as a step.
  it('keeps the numbers of the parts when spaces alone stood between two chips', () => {
    const first = save(emptyScene(), [{
      id: 'doc_x',
      kind: 'text',
      content: ' After.',
      parts: [rain, { type: 'text', text: ' ' }, thunder, { type: 'text', text: 'After.' }],
    }]);

    expect(anchorsOf(first)).toEqual(['doc_x/p3/s0']);
    expect(anchorsOf(cycle(first))).toEqual(['doc_x/p3/s0']);
    expect(anchorsOf(cycle(cycle(first)))).toEqual(['doc_x/p3/s0']);
  });

  it('gives the later of two steps stored under one id an id of its own when the scene opens', () => {
    const step: TimelineStep = { id: 'step_twin', blockType: 'text', data: { content: 'First.', typewriterSpeed: 30, anchorTo: 'background' }, collapsed: false, enabled: true } as TimelineStep;
    const twins = emptyScene([step, { ...step, data: { ...(step.data as TextBlockData), content: 'Second.' } }]);

    const saved = cycle(twins);

    expect(saved.timeline.map((item) => item.id)[0]).toBe('step_twin');
    expect(new Set(saved.timeline.map((item) => item.id)).size).toBe(saved.timeline.length);
    expect(saved.timeline.map((item) => (item.data as TextBlockData).content)).toEqual(['First.', 'Second.']);
  });
});

describe('saved inline parts after an assistant edits their canonical steps', () => {
  const dialogueScene = () => save(emptyScene(), [{
    id: 'doc_dialogue', kind: 'dialogue', characterId: 'alice', speakerName: 'Alice', spriteId: null,
    text: 'First. Second.',
    parts: [{ type: 'text', text: 'First. ' }, rain, { type: 'text', text: 'Second.' }],
  }]);
  const dialogueSteps = (scene: SceneRecord) => scene.timeline.filter((step) => step.blockType === 'dialogue');

  it.each(['speaker', 'sprite', 'extra entry', 'disabled', 'condition', 'current entry'] as const)(
    'preserves a changed %s over repeated saves', (change) => {
      const before = dialogueScene();
      const second = dialogueSteps(before)[1];
      const data = structuredClone(second.data as DialogueBlockData);
      if (change === 'speaker') Object.assign(data.entries[0], { characterId: 'bob', speakerName: 'Bob' });
      if (change === 'sprite') data.entries[0].spriteId = 'angry';
      if (change === 'extra entry' || change === 'current entry') {
        data.entries.push(createDialogueEntry({ characterId: 'bob', text: 'Third.' }));
      }
      if (change === 'current entry') data.currentEntryIndex = 1;
      const conditions = change === 'condition' ? [{ variableName: 'ready', operator: '==' as const, value: true }] : undefined;
      const after = applyAiScenePatch(before, {
        storyId: before.storyId, sceneId: before.id, expectedRevision: computeSceneRevision(before), explanation: '',
        operations: change === 'disabled' || change === 'condition'
          ? [{ op: 'replace_step', stepId: second.id, step: { ...second, enabled: change !== 'disabled', conditions } }]
          : [{ op: 'update_step', stepId: second.id, data: { entries: data.entries, currentEntryIndex: data.currentEntryIndex } }],
      });

      for (const saved of [cycle(after), cycle(cycle(after))]) {
        const steps = dialogueSteps(saved);
        expect(steps).toHaveLength(2);
        expect((steps[1].data as DialogueBlockData).entries).toEqual(data.entries.map((entry, index) =>
          index === 0 ? { ...entry, speakerName: entry.characterId } : entry));
        expect((steps[1].data as DialogueBlockData).currentEntryIndex).toBe(data.currentEntryIndex);
        expect(steps[1].enabled).toBe(change !== 'disabled');
        expect(steps[1].conditions).toEqual(conditions);
        expect(steps[1].id).toBe(second.id);
        expect(new Set(contentBlocks(reopen(saved)).map((block) => block.id)).size).toBe(contentBlocks(reopen(saved)).length);
      }
    },
  );

  it('preserves text playback settings changed in an inline part', () => {
    const before = save(emptyScene(), [{
      id: 'doc_text', kind: 'text', content: 'First. Second.',
      parts: [{ type: 'text', text: 'First. ' }, rain, { type: 'text', text: 'Second.' }],
    }]);
    const second = before.timeline[2];
    const after = applyAiScenePatch(before, {
      storyId: before.storyId, sceneId: before.id, expectedRevision: computeSceneRevision(before), explanation: '',
      operations: [{ op: 'update_step', stepId: second.id, data: { typewriterSpeed: 0.1, anchorTo: 'character', characterId: 'alice' } }],
    });

    expect(cycle(cycle(after)).timeline.find((step) => step.id === second.id)?.data).toEqual(after.timeline[2].data);
  });

  const lineWithRain = () => save(emptyScene(), [{
    id: 'doc_text', kind: 'text', content: 'First. Second.',
    parts: [{ type: 'text', text: 'First. ' }, rain, { type: 'text', text: 'Second.' }],
  }]);
  const textsOf = (blocks: DocumentBlock[]) => contentBlocks(blocks).map((block) => block.kind === 'text' ? block.content : block.kind);
  /** Runs of text beside a chip are saved as new steps each time; what they hold and where they came from stays. */
  const withoutStepIds = (scene: SceneRecord) => scene.timeline.map(({ id: _id, ...step }) => step);

  it('opens the rest of a line broken by a step put between its parts as a line of its own, with no spaces before it', () => {
    const before = lineWithRain();
    const after = applyAiScenePatch(before, {
      storyId: before.storyId, sceneId: before.id, expectedRevision: computeSceneRevision(before), explanation: '',
      operations: [{ op: 'insert_steps', afterStepId: before.timeline[1].id, steps: [createBackgroundStep({ assetId: null })] }],
    });

    expect(textsOf(reopen(after))).toEqual(['First. ', 'technical', 'Second.']);
    expect(contentBlocks(reopen(after))[0]).toMatchObject({ id: 'doc_text', parts: [{ type: 'text', text: 'First. ' }, rain] });
    const saved = cycle(after);
    expect(textsOf(reopen(saved))).toEqual(['First. ', 'technical', 'Second.']);
    expect(withoutStepIds(cycle(saved))).toEqual(withoutStepIds(saved));
  });

  it('keeps a chip switched off in the middle of a line, and both halves of the line as they were', () => {
    const before = lineWithRain();
    const chip = before.timeline[1];
    const after = applyAiScenePatch(before, {
      storyId: before.storyId, sceneId: before.id, expectedRevision: computeSceneRevision(before), explanation: '',
      operations: [{ op: 'replace_step', stepId: chip.id, step: { ...chip, enabled: false } }],
    });

    expect(textsOf(reopen(after))).toEqual(['First. ', 'technical', 'Second.']);
    const saved = cycle(after);
    expect(saved.timeline.map((step) => [step.blockType, step.enabled])).toEqual([['text', true], ['effect', false], ['text', true]]);
    expect(saved.timeline.map((step) => (step.data as TextBlockData).content ?? null)).toEqual(['First. ', null, 'Second.']);
    expect(cycle(saved).timeline).toEqual(saved.timeline);
  });
});

describe('a setting fastened to a sentence, after the words were edited', () => {
  const sentencesOf = (blocks: DocumentBlock[]) => addressSentences(save(emptyScene(), blocks).timeline);
  const fastenedTo = (blocks: DocumentBlock[], text: string): ComicAnchored => {
    const sentence = sentencesOf(blocks).find((item) => item.text === text)!;
    return { anchor: sentence.anchor, print: sentence.print };
  };
  const before: DocumentBlock[] = [
    { id: 'doc_a', kind: 'text', content: 'The door creaked. Nobody came.' },
    { id: 'doc_b', kind: 'text', content: 'Rain began.' },
  ];

  it('stays where it was when the words are', () => {
    const setting = fastenedTo(before, 'Nobody came.');

    expect(resolveComicAnchor(setting, sentencesOf(before))).toEqual({ status: 'bound', anchor: 'doc_a/p0/s1' });
  });

  it('follows its sentence when one is written before it in the block', () => {
    const setting = fastenedTo(before, 'Nobody came.');
    const after: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'Silence. The door creaked. Nobody came.' }, before[1]];

    expect(resolveComicAnchor(setting, sentencesOf(after))).toEqual({ status: 'moved', anchor: 'doc_a/p0/s2', from: 'doc_a/p0/s1' });
  });

  it('follows its sentence when an inline chip is put before it', () => {
    const setting = fastenedTo(before, 'Nobody came.');
    const after: DocumentBlock[] = [{
      id: 'doc_a', kind: 'text', content: 'The door creaked. Nobody came.',
      parts: [{ type: 'text', text: 'The door creaked. ' }, rain, { type: 'text', text: 'Nobody came.' }],
    }, before[1]];

    expect(resolveComicAnchor(setting, sentencesOf(after))).toEqual({ status: 'moved', anchor: 'doc_a/p2/s0', from: 'doc_a/p0/s1' });
  });

  it('follows its sentence into the block a split made, and into the block a merge left', () => {
    const setting = fastenedTo(before, 'Nobody came.');
    const split: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'The door creaked.' }, { id: 'doc_new', kind: 'text', content: 'Nobody came.' }, before[1]];
    const merged: DocumentBlock[] = [{ id: 'doc_b', kind: 'text', content: 'The door creaked. Nobody came. Rain began.' }];

    expect(resolveComicAnchor(setting, sentencesOf(split))).toEqual({ status: 'moved', anchor: 'doc_new/p0/s0', from: 'doc_a/p0/s1' });
    expect(resolveComicAnchor(setting, sentencesOf(merged))).toEqual({ status: 'moved', anchor: 'doc_b/p0/s1', from: 'doc_a/p0/s1' });
  });

  // A copy of the block holds the same words; the setting is not stolen by it, nor doubled onto it.
  it('stays with the original when its block is copied', () => {
    const setting = fastenedTo(before, 'Nobody came.');
    const copied: DocumentBlock[] = [before[0], { id: 'doc_copy', kind: 'text', content: 'The door creaked. Nobody came.' }, before[1]];

    expect(resolveComicAnchor(setting, sentencesOf(copied))).toEqual({ status: 'bound', anchor: 'doc_a/p0/s1' });
  });

  it('is kept, marked as changed, when a typo in its sentence was corrected', () => {
    const typo: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'The door creaked. Nobdoy came.' }, before[1]];
    const setting = fastenedTo(typo, 'Nobdoy came.');

    expect(resolveComicAnchor(setting, sentencesOf(before))).toEqual({ status: 'changed', anchor: 'doc_a/p0/s1' });
  });

  // An edit changes at least as many characters as the lengths differ by.
  it('is kept as changed when its words grew by a quarter, and cut loose when they grew more', () => {
    const setting = fastenedTo([{ id: 'doc_a', kind: 'text', content: 'It was late.' }], 'It was late.');

    expect(resolveComicAnchor(setting, sentencesOf([{ id: 'doc_a', kind: 'text', content: 'It was too late.' }]))).toEqual({ status: 'changed', anchor: 'doc_a/p0/s0' });
    expect(resolveComicAnchor(setting, sentencesOf([{ id: 'doc_a', kind: 'text', content: 'It was far too late.' }]))).toEqual({ status: 'detached' });
  });

  it('is cut loose, not guessed, when its words are now in two places or nowhere alike', () => {
    const setting = fastenedTo(before, 'Nobody came.');
    const twice: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'The door creaked.' }, { id: 'doc_c', kind: 'text', content: 'Nobody came.' }, { id: 'doc_d', kind: 'text', content: 'Nobody came.' }];
    const rewritten: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'The door creaked. Footsteps on the stairs, then a knock.' }, before[1]];
    const gone: DocumentBlock[] = [before[1]];

    expect(resolveComicAnchor(setting, sentencesOf(twice))).toEqual({ status: 'detached' });
    expect(resolveComicAnchor(setting, sentencesOf(rewritten))).toEqual({ status: 'detached' });
    expect(resolveComicAnchor(setting, sentencesOf(gone))).toEqual({ status: 'detached' });
  });

  it('is kept by its place alone when it has no print', () => {
    expect(resolveComicAnchor({ anchor: 'doc_a/p0/s1' }, sentencesOf(before))).toEqual({ status: 'bound', anchor: 'doc_a/p0/s1' });
    expect(resolveComicAnchor({ anchor: 'doc_gone/p0/s0' }, sentencesOf(before))).toEqual({ status: 'detached' });
  });
});
