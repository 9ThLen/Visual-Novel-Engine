import { resolveSelectionAnchors } from '@/lib/ai/editor-context-resolver';
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
function bootFrame() {
  const dom = new JSDOM('<iframe></iframe>', { url: 'http://localhost:3000', runScripts: 'dangerously', pretendToBeVisual: true });
  const target = dom.window.document.querySelector('iframe')!.contentWindow!;
  const posted: Posted[] = [];
  vi.spyOn(dom.window, 'postMessage').mockImplementation((message: Posted) => { posted.push(message); });
  target.document.open();
  target.document.write(createVNPlateEditorHtml({
    editorId: 'frame',
    scene: { sceneId: 'scene-1', sceneName: 'Scene', blocks },
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

  return { dom, target, posted, block, textNodes, select, flush, lastSelection };
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
});
