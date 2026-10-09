import { resolveFocusedBlock, resolveSelectionAnchors } from '@/lib/ai/editor-context-resolver';
import { createDocumentTechnicalBlock, sceneRecordToDocumentScene } from '@/lib/document-editor/document-scene';
import type { DocumentBlock, DocumentInlinePart, DocumentScene } from '@/lib/document-editor/types';
import { saveDocumentSceneToRecord } from '@/lib/document-scene-persistence';
import type { SceneRecord, TextBlockData } from '@/lib/engine/types';
import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';
// @ts-expect-error The installed jsdom test runtime does not ship declarations.
import { JSDOM } from 'jsdom';

const rain: DocumentInlinePart = {
  type: 'effect',
  id: 'fx_rain',
  effectType: 'rain',
  target: 'screen',
  intensity: 50,
  duration: 3,
};

const blocks: DocumentBlock[] = [
  { id: 'blk_first', kind: 'text', content: 'Перший абзац.' },
  { id: 'blk_second', kind: 'text', content: 'Крок, ще крок, і ще крок.' },
  {
    id: 'blk_chip',
    kind: 'text',
    content: 'Дощ почався. Він не вщухав.',
    parts: [{ type: 'text', text: 'Дощ почався. ' }, rain, { type: 'text', text: 'Він не вщухав.' }],
  },
];

function emptySceneRecord(): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story_1',
    name: 'Scene',
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
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

type Posted = { type: string; [key: string]: unknown };

/** Boots the real editor script in a frame and records what it posts to the host. */
function bootFrame(sceneBlocks: DocumentBlock[] = blocks) {
  const dom = new JSDOM('<iframe></iframe>', { url: 'http://localhost:3000', runScripts: 'dangerously', pretendToBeVisual: true });
  const target = dom.window.document.querySelector('iframe')!.contentWindow!;
  const posted: Posted[] = [];
  vi.spyOn(dom.window, 'postMessage').mockImplementation((message: Posted) => { posted.push(message); });
  target.document.open();
  target.document.write(createVNPlateEditorHtml({
    editorId: 'frame',
    scene: { sceneId: 'scene-1', sceneName: 'Scene', blocks: sceneBlocks },
    characters: [],
    isPhone: false,
  }));
  target.document.close();
  // jsdom has no editing commands, and the format state reads them as soon as
  // a selection sits inside the editor.
  target.document.queryCommandState = () => false;
  target.document.queryCommandValue = () => '';

  const block = (id: string): HTMLElement => target.document.querySelector(`#editor [data-id="${id}"]`)!;
  const textNodes = (id: string): Text[] => Array.from(block(id).childNodes)
    .filter((node): node is Text => (node as Node).nodeType === 3 && Boolean((node as Node).textContent));

  const select = (start: Text, startOffset: number, end: Text, endOffset: number) => {
    const range = target.document.createRange();
    range.setStart(start, startOffset);
    range.setEnd(end, endOffset);
    const selection = target.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    target.document.dispatchEvent(new target.Event('selectionchange'));
  };

  const flush = (withSelection: boolean): Posted => {
    const requestId = `req-${posted.length}`;
    target.dispatchEvent(new target.MessageEvent('message', {
      data: { source: 'vn-plate-host', editorId: 'frame', type: 'flush', requestId, ...(withSelection ? { withSelection: true } : {}) },
      source: dom.window,
    }));
    return posted.find((message) => message.type === 'flushed' && message.requestId === requestId)!;
  };

  const lastSelection = (): VNPlateSelectionState | undefined => posted
    .filter((message) => message.type === 'selectionState')
    .map((message) => message.state as VNPlateSelectionState)
    .at(-1);

  const selectionStates = (): VNPlateSelectionState[] => posted
    .filter((message) => message.type === 'selectionState')
    .map((message) => message.state as VNPlateSelectionState);

  const click = (node: Element) => {
    node.dispatchEvent(new target.MouseEvent('click', { bubbles: true, cancelable: true }));
  };

  const press = (key: string) => {
    target.document.dispatchEvent(new target.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };

  return { dom, target, posted, block, textNodes, select, flush, lastSelection, selectionStates, click, press };
}

const settle = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

describe('editor frame selection', () => {
  let frame: ReturnType<typeof bootFrame>;

  beforeEach(() => {
    frame = bootFrame();
  });

  afterEach(() => {
    frame.dom.window.close();
    vi.restoreAllMocks();
  });

  it('reports the selected text with its block and what surrounds it', async () => {
    const [text] = frame.textNodes('blk_first');
    frame.select(text, 0, text, 'Перший'.length);
    await settle();

    expect(frame.lastSelection()).toMatchObject({
      collapsed: false,
      text: 'Перший',
      textLength: 6,
      truncated: false,
      before: '',
      after: ' абзац.',
      crossesChip: false,
      blocks: [{ id: 'blk_first', kind: 'text', quote: 'Перший', occurrence: 0 }],
    });
    expect(frame.lastSelection()?.blocks[0].parts).toBeUndefined();
  });

  it('says which repeat of a phrase is selected', async () => {
    const [text] = frame.textNodes('blk_second');
    const second = text.data.indexOf('крок', text.data.indexOf('крок') + 1);
    frame.select(text, second, text, second + 'крок'.length);
    await settle();

    expect(frame.lastSelection()?.blocks[0]).toMatchObject({ quote: 'крок', occurrence: 1 });
  });

  it('splits a selection across a chip per text part and leaves the chip label out', async () => {
    const [before, after] = frame.textNodes('blk_chip');
    frame.select(before, 'Дощ '.length, after, 'Він'.length);
    await settle();

    const state = frame.lastSelection();
    expect(state).toMatchObject({ text: 'почався. Він', crossesChip: true, before: 'Дощ ', after: ' не вщухав.' });
    expect(state?.blocks).toEqual([{
      id: 'blk_chip',
      kind: 'text',
      quote: 'почався. Він',
      occurrence: 0,
      parts: [
        { index: 0, quote: 'почався. ', occurrence: 0 },
        { index: 2, quote: 'Він', occurrence: 0 },
      ],
    }]);
  });

  it('joins a selection over several blocks with a line break', async () => {
    const [first] = frame.textNodes('blk_first');
    const [second] = frame.textNodes('blk_second');
    frame.select(first, 'Перший '.length, second, 'Крок'.length);
    await settle();

    const state = frame.lastSelection();
    expect(state?.text).toBe('абзац.\nКрок');
    expect(state?.blocks.map((block) => [block.id, block.quote])).toEqual([
      ['blk_first', 'абзац.'],
      ['blk_second', 'Крок'],
    ]);
  });

  it('reports a caret as a place without text', async () => {
    const [text] = frame.textNodes('blk_first');
    frame.select(text, 3, text, 3);
    await settle();

    expect(frame.lastSelection()).toMatchObject({
      collapsed: true,
      text: '',
      blocks: [{ id: 'blk_first', quote: '', occurrence: 0 }],
    });
  });

  it('numbers every later state above the earlier ones', async () => {
    const [text] = frame.textNodes('blk_first');
    frame.select(text, 0, text, 3);
    await settle();
    const first = frame.lastSelection()!.seq;
    frame.select(text, 0, text, 6);
    await settle();

    expect(frame.lastSelection()!.seq).toBeGreaterThan(first);
  });

  describe('flush with selection', () => {
    it('answers a plain flush exactly as before', () => {
      const flushed = frame.flush(false);

      expect(flushed).toHaveProperty('scene');
      expect(flushed).not.toHaveProperty('selection');
      expect(flushed).not.toHaveProperty('hasUnreportedChanges');
    });

    it('returns content and selection from one pass, with part numbers that match the content', () => {
      const [before, after] = frame.textNodes('blk_chip');
      frame.select(before, 'Дощ '.length, after, 'Він'.length);

      // No waiting: the debounced report has not gone out yet.
      const flushed = frame.flush(true);
      const selection = flushed.selection as VNPlateSelectionState;
      const scene = flushed.scene as { blocks: DocumentBlock[] };
      const serialized = scene.blocks.find((block) => block.id === 'blk_chip') as Extract<DocumentBlock, { kind: 'text' }>;

      expect(frame.lastSelection()).toBeUndefined();
      expect(selection.blocks[0].parts).toHaveLength(2);
      for (const part of selection.blocks[0].parts!) {
        const serializedPart = serialized.parts![part.index];
        expect(serializedPart.type).toBe('text');
        expect((serializedPart as { text: string }).text).toContain(part.quote.trim());
      }
    });

    it('lets the host address the selection once the captured content is saved', () => {
      const [before, after] = frame.textNodes('blk_chip');
      frame.select(before, 'Дощ '.length, after, 'Він'.length);
      const flushed = frame.flush(true);
      const document = flushed.scene as DocumentScene;
      const selection = flushed.selection as VNPlateSelectionState;

      const normalized = normalizePlateDocumentScene(document, []);
      const scene = saveDocumentSceneToRecord(emptySceneRecord(), normalized.scene, normalized.characters);
      const anchors = resolveSelectionAnchors({ scene, document, characters: [], blocks: selection.blocks });

      const textOf = (stepId: string | null) =>
        (scene.timeline.find((step) => step.id === stepId)?.data as TextBlockData | undefined)?.content;
      expect(anchors.map((anchor) => anchor.match)).toEqual(['exact', 'exact']);
      expect(textOf(anchors[0].stepId)).toContain('Дощ почався.');
      expect(textOf(anchors[1].stepId)).toContain('Він не вщухав.');
    });

    it('reports null when nothing in the editor is selected', () => {
      expect(frame.flush(true).selection).toBeNull();
    });

    it('says whether the frame was still holding an edit the host had not seen', async () => {
      const [text] = frame.textNodes('blk_first');
      text.data = 'Перший абзац, дописаний.';
      frame.block('blk_first').dispatchEvent(new frame.target.Event('input', { bubbles: true }));

      const during = frame.flush(true);
      expect(during.hasUnreportedChanges).toBe(true);
      expect(JSON.stringify(during.scene)).toContain('дописаний');

      await settle(400);
      expect(frame.posted.some((message) => message.type === 'save')).toBe(true);
      expect(frame.flush(true).hasUnreportedChanges).toBe(false);
    });
  });

  // A flush answers ahead of the debounce, and the debounce still reports. The
  // host has to be able to tell that report from a new edit, or a scene saved
  // from the flush turns unsaved again a moment later.
  describe('the debounced report after a flush', () => {
    const type = (text: string) => {
      frame.textNodes('blk_first')[0].data = text;
      frame.block('blk_first').dispatchEvent(new frame.target.Event('input', { bubbles: true }));
    };
    const saves = () => frame.posted.filter((message) => message.type === 'save');

    it('names the flush that already delivered the edit', async () => {
      type('Перший абзац, дописаний.');
      const flushed = frame.flush(true);
      await settle(400);

      expect(saves()).toHaveLength(1);
      expect(saves()[0].flushedBy).toBe(flushed.requestId);
      expect(JSON.stringify(saves()[0].scene)).toContain('дописаний');
    });

    it('names a plain flush too, which says so only when it carried an edit', async () => {
      type('Перший абзац, дописаний.');
      const flushed = frame.flush(false);
      await settle(400);

      expect(flushed.hasUnreportedChanges).toBe(true);
      expect(flushed).not.toHaveProperty('selection');
      expect(saves()[0].flushedBy).toBe(flushed.requestId);
    });

    it('holds an edit as reported once a flush has carried it', () => {
      type('Перший абзац, дописаний.');
      frame.flush(false);

      expect(frame.flush(true).hasUnreportedChanges).toBe(false);
    });

    it('keeps naming the flush that carried the edit after later ones that carried nothing', async () => {
      type('Перший абзац, дописаний.');
      const first = frame.flush(true);
      frame.flush(true);
      await settle(400);

      expect(saves()[0].flushedBy).toBe(first.requestId);
    });

    it('names no flush once the text has changed again', async () => {
      type('Перший абзац, дописаний.');
      frame.flush(true);
      type('Перший абзац, дописаний двічі.');
      await settle(400);

      expect(saves()).toHaveLength(1);
      expect(saves()[0]).not.toHaveProperty('flushedBy');
      expect(JSON.stringify(saves()[0].scene)).toContain('двічі');
    });

    it('names no flush when nothing came between the edit and its report', async () => {
      type('Перший абзац, дописаний.');
      await settle(400);

      expect(saves()).toHaveLength(1);
      expect(saves()[0]).not.toHaveProperty('flushedBy');
    });

    // An undo reports itself at once, without the debounce; the timer armed by
    // the typing is still running and must not pass that report off as flushed.
    it('names no flush once a change that reports itself has followed', async () => {
      type('Перший абзац, дописаний.');
      frame.flush(true);
      frame.target.dispatchEvent(new frame.target.MessageEvent('message', {
        data: { source: 'vn-plate-host', editorId: 'frame', type: 'undo' },
        source: frame.dom.window,
      }));
      const immediate = saves().length;
      await settle(400);

      expect(immediate).toBe(1);
      expect(saves().length).toBeGreaterThanOrEqual(1);
      saves().forEach((message) => expect(message).not.toHaveProperty('flushedBy'));
    });
  });
});

describe('editor frame focus on a block that is not text', () => {
  const background = createDocumentTechnicalBlock('background');
  const transition = createDocumentTechnicalBlock('transition');
  const choice: DocumentBlock = {
    id: 'blk_choice',
    kind: 'choice',
    question: 'Куди далі?',
    options: [{ id: 'opt_stay', text: 'Лишитися', targetSceneId: null }],
  };
  const focusBlocks: DocumentBlock[] = [background, ...blocks, transition, choice];

  let frame: ReturnType<typeof bootFrame>;

  beforeEach(() => {
    frame = bootFrame(focusBlocks);
  });

  afterEach(() => {
    frame.dom.window.close();
    vi.restoreAllMocks();
  });

  it('reports a block the author clicked, with no text selection needed', async () => {
    frame.click(frame.block(background.id));
    await settle();

    expect(frame.lastSelection()).toMatchObject({
      collapsed: true,
      text: '',
      blocks: [],
      focus: { id: background.id, kind: 'technical', command: 'background', state: 'selected' },
    });
  });

  it('says so when the block’s settings are open', async () => {
    frame.click(frame.block(transition.id));
    await settle();

    expect(frame.lastSelection()?.focus).toEqual({
      id: transition.id,
      kind: 'technical',
      command: 'transition',
      state: 'editing',
    });
  });

  it('names a choice block as a choice', async () => {
    frame.click(frame.block('blk_choice'));
    await settle();

    expect(frame.lastSelection()?.focus).toMatchObject({ id: 'blk_choice', kind: 'choice', command: 'choice' });
  });

  it('keeps the block as recent once its settings are closed', async () => {
    frame.click(frame.block(transition.id));
    await settle();
    frame.press('Escape');
    await settle();

    expect(frame.lastSelection()?.focus).toMatchObject({ id: transition.id, state: 'recent' });
  });

  it('lets go of the block when the author goes back to the text', async () => {
    frame.click(frame.block(transition.id));
    await settle();
    frame.press('Escape');
    await settle();

    // A click into a paragraph puts the caret there; jsdom has to be told.
    const [text] = frame.textNodes('blk_first');
    frame.select(text, 2, text, 2);
    frame.click(frame.block('blk_first'));
    await settle();

    const state = frame.lastSelection();
    expect(state?.focus).toBeUndefined();
    expect(state?.blocks).toMatchObject([{ id: 'blk_first' }]);
  });

  it('carries both when a block is highlighted while the caret sits in a paragraph', async () => {
    const [text] = frame.textNodes('blk_first');
    frame.select(text, 2, text, 2);
    frame.click(frame.block(background.id));
    await settle();

    expect(frame.lastSelection()).toMatchObject({
      blocks: [{ id: 'blk_first' }],
      focus: { id: background.id, state: 'selected' },
    });
  });

  it('addresses an inline chip by the text block it sits in and its part number', async () => {
    const chip = frame.block('blk_chip').querySelector('.effect-chip')!;
    frame.click(chip);
    await settle();

    expect(frame.lastSelection()?.focus).toEqual({
      id: 'blk_chip',
      kind: 'text',
      command: 'effect',
      partIndex: 1,
      state: 'editing',
    });
  });

  it('does not repeat a state that says nothing new', async () => {
    frame.click(frame.block(background.id));
    await settle();
    const reported = frame.selectionStates().length;

    frame.target.document.dispatchEvent(new frame.target.Event('selectionchange'));
    await settle();

    expect(frame.selectionStates()).toHaveLength(reported);
  });

  it('hands the focus over with a flush, and the host finds its step', () => {
    frame.click(frame.block(background.id));

    // No waiting: the debounced report has not gone out yet.
    const flushed = frame.flush(true);
    const selection = flushed.selection as VNPlateSelectionState;
    const document = flushed.scene as DocumentScene;
    const normalized = normalizePlateDocumentScene(document, []);
    const scene = saveDocumentSceneToRecord(emptySceneRecord(), normalized.scene, normalized.characters);

    expect(frame.lastSelection()).toBeUndefined();
    expect(selection.focus).toMatchObject({ id: background.id, state: 'selected' });
    const focus = resolveFocusedBlock({ scene, document, characters: [], focus: selection.focus });
    expect(focus).toMatchObject({ blockType: 'background', match: 'exact', state: 'selected' });
    expect(scene.timeline.find((step) => step.id === focus?.stepId)?.blockType).toBe('background');
  });

  // A choice made in this session has no step yet: its id is minted on save,
  // so only the converter's pairing can say which step it became.
  it('finds the step of a choice block that was never saved before', () => {
    frame.click(frame.block('blk_choice'));

    const flushed = frame.flush(true);
    const document = flushed.scene as DocumentScene;
    const normalized = normalizePlateDocumentScene(document, []);
    const scene = saveDocumentSceneToRecord(emptySceneRecord(), normalized.scene, normalized.characters);
    const focus = resolveFocusedBlock({
      scene,
      document,
      characters: [],
      focus: (flushed.selection as VNPlateSelectionState).focus,
    });

    expect(focus).toMatchObject({ blockType: 'choice', match: 'exact' });
    expect(scene.timeline.find((step) => step.id === focus?.stepId)?.blockType).toBe('choice');
    expect(focus?.summary).toContain('Лишитися');
  });
});

// The browser answers Enter by cloning the line it splits, attributes and all,
// so both halves come out under the id of the block that was loaded.
describe('editor frame line ids', () => {
  const stored = (() => {
    const record = emptySceneRecord();
    const typed = normalizePlateDocumentScene({
      sceneId: record.id,
      sceneName: record.name,
      blocks: [{ id: 'doc_first', kind: 'text', content: 'Перший абзац.' }, { id: 'doc_second', kind: 'text', content: 'Другий абзац.' }],
    }, []);
    return saveDocumentSceneToRecord(record, typed.scene, typed.characters);
  })();
  const [firstStep, secondStep] = stored.timeline;
  let frame: ReturnType<typeof bootFrame>;

  beforeEach(() => {
    frame = bootFrame(sceneRecordToDocumentScene(stored).blocks);
  });

  afterEach(() => {
    frame.dom.window.close();
    vi.restoreAllMocks();
  });

  /** What the browser leaves behind when Enter splits a line: a clone, placed after it. */
  const split = (id: string, head: string, tail: string) => {
    const line = frame.block(id);
    const clone = line.cloneNode(false) as HTMLElement;
    line.textContent = head;
    clone.textContent = tail;
    line.insertAdjacentElement('afterend', clone);
    line.dispatchEvent(new frame.target.Event('input', { bubbles: true }));
    return { line, clone };
  };
  const saved = () => {
    const document = frame.flush(false).scene as DocumentScene;
    const normalized = normalizePlateDocumentScene(document, []);
    return { document, scene: saveDocumentSceneToRecord(stored, normalized.scene, normalized.characters) };
  };
  const textBlocks = (document: DocumentScene) => document.blocks
    .filter((block): block is Extract<DocumentBlock, { kind: 'text' }> => block.kind === 'text' && Boolean(block.content));

  it('gives the second half of a split line an id of its own, and its own step', () => {
    const { line, clone } = split(firstStep.id, 'Перший', ' абзац, розбитий.');

    const { document, scene } = saved();
    const [head, tail] = textBlocks(document);

    expect(line.dataset.id).toBe(firstStep.id);
    expect(clone.dataset.id).not.toBe(firstStep.id);
    expect(head).toMatchObject({ id: firstStep.id, content: 'Перший', sourceStep: { id: firstStep.id } });
    expect(tail).toMatchObject({ id: clone.dataset.id, content: ' абзац, розбитий.' });
    expect(tail.sourceStep).toBeUndefined();
    expect(scene.timeline.map((step) => step.id).slice(0, 1)).toEqual([firstStep.id]);
    expect(new Set(scene.timeline.map((step) => step.id)).size).toBe(scene.timeline.length);
    expect(scene.timeline.at(-1)?.id).toBe(secondStep.id);
  });

  // Enter at the start of a line leaves an empty line above the text: the text
  // is still the paragraph that was saved, so it is the one that keeps the id.
  it('leaves the id with the half that holds the text', () => {
    const { line, clone } = split(firstStep.id, '', 'Перший абзац.');

    const { document, scene } = saved();

    expect(clone.dataset.id).toBe(firstStep.id);
    expect(line.dataset.id).not.toBe(firstStep.id);
    expect(textBlocks(document)[0]).toMatchObject({ id: firstStep.id, content: 'Перший абзац.' });
    expect(scene.timeline.map((step) => step.id)).toEqual([firstStep.id, secondStep.id]);
  });

  it('keeps apart a selection in the new half from the line it was split from', async () => {
    const { clone } = split(firstStep.id, 'Перший', ' абзац, розбитий.');
    const text = clone.firstChild as Text;
    frame.select(text, 1, text, 6);
    await settle();

    expect(frame.lastSelection()?.blocks).toEqual([
      { id: clone.dataset.id, kind: 'text', quote: 'абзац', occurrence: 0 },
    ]);
  });

  // A scene saved before this was fixed can already hold two steps under one
  // id; the next save of it sets that right.
  it('sets right a scene that was stored with two lines under one id', () => {
    frame.dom.window.close();
    const twins = sceneRecordToDocumentScene({ ...stored, timeline: [firstStep, { ...secondStep, id: firstStep.id }] });
    frame = bootFrame(twins.blocks);

    const { scene } = saved();

    expect(scene.timeline).toHaveLength(2);
    expect(scene.timeline[0].id).toBe(firstStep.id);
    expect(scene.timeline[1].id).not.toBe(firstStep.id);
    expect((scene.timeline[1].data as TextBlockData).content).toBe('Другий абзац.');
  });
});
