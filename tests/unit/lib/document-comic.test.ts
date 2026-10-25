import { documentSceneNovelOnly, selectionComicAnchor } from '@/lib/document-editor/document-comic';
import { documentSceneToTimelineWithOrigins } from '@/lib/document-editor/document-scene';
import type { DocumentBlock, DocumentInlinePart } from '@/lib/document-editor/types';
import type { VNPlateSelectionBlock } from '@/lib/vn-plate-editor/types';
import type { TimelineStep } from '@/lib/engine/types';

function technical(blockType: TimelineStep['blockType'], data: Record<string, unknown>, enabled = true): DocumentBlock {
  const step = { id: `step-${blockType}`, blockType, data, collapsed: false, enabled } as unknown as TimelineStep;
  return { id: step.id, kind: 'technical', commandId: 'video', blockType, label: '', summary: '', step } as DocumentBlock;
}

const words: DocumentBlock = { id: 'words', kind: 'text', content: 'Rain.' };

describe('what keeps a scene being written a novel', () => {
  it('is nothing in a page of words', () => {
    expect(documentSceneNovelOnly({ blocks: [words] })).toBeNull();
  });

  it('is a video block that plays, or an interactive object', () => {
    expect(documentSceneNovelOnly({ blocks: [words, technical('video', { mode: 'play', layer: 'cutscene' })] })).toBe('video');
    expect(documentSceneNovelOnly({ blocks: [technical('interactive_object', { objectId: 'door' })] })).toBe('interactive_object');
  });

  it('is not a video block that stops one, or a switched-off block', () => {
    expect(documentSceneNovelOnly({ blocks: [technical('video', { mode: 'stop', layer: 'cutscene' })] })).toBeNull();
    expect(documentSceneNovelOnly({ blocks: [technical('interactive_object', { objectId: 'door' }, false)] })).toBeNull();
  });
});

describe('the sentence under the author\'s caret', () => {
  const thunder: DocumentInlinePart = { type: 'sound', id: 'sfx_thunder', mode: 'track', assetId: null, volume: 0.8, loop: false, fadeIn: 0, fadeOut: 0.8, pitchVariation: 0, boundTo: 'continuous' };
  const long = Array.from({ length: 40 }, (_, index) => `Line ${index + 1} goes on a while.`).join(' ');
  const blocks: DocumentBlock[] = [
    { id: 'rain', kind: 'text', content: 'Rain falls. Wind howls. Rain falls.' },
    { id: 'storm', kind: 'text', content: 'Listen. Thunder. It stopped.', parts: [{ type: 'text', text: 'Listen. Thunder. ' }, thunder, { type: 'text', text: 'It stopped.' }] },
    { id: 'line', kind: 'dialogue', speakerName: 'Ann', characterId: 'ann', spriteId: 'ann-smile', text: 'Who is there? Answer me!' },
    { id: 'long', kind: 'text', content: long },
    { id: 'lines', kind: 'text', content: 'One fell.\n\nWhere now? How so?' },
  ];
  const timeline = documentSceneToTimelineWithOrigins({ sceneId: 's', sceneName: 'S', blocks }).timeline;

  /** A selection as the editor's frame reports it: what stood before and after it in its block, 300 characters at most. */
  const selection = (block: Partial<VNPlateSelectionBlock> & Pick<VNPlateSelectionBlock, 'id' | 'kind'>, text: string, start: number, quote = '') => ({
    blocks: [{ quote, occurrence: 0, ...block }],
    before: text.slice(0, start).slice(-300),
    after: text.slice(start + quote.length).slice(0, 300),
  });
  const rain = blocks[0].kind === 'text' ? blocks[0].content : '';

  it('is the sentence the caret stands in', () => {
    expect(selectionComicAnchor(selection({ id: 'rain', kind: 'text' }, rain, 0), timeline)).toBe('rain/p0/s0');
    expect(selectionComicAnchor(selection({ id: 'rain', kind: 'text' }, rain, 14), timeline)).toBe('rain/p0/s1');
    // The same words twice: the ones the caret is in.
    expect(selectionComicAnchor(selection({ id: 'rain', kind: 'text' }, rain, 26), timeline)).toBe('rain/p0/s2');
    expect(selectionComicAnchor(selection({ id: 'rain', kind: 'text' }, rain, rain.length), timeline)).toBe('rain/p0/s2');
  });

  it('is where a selection starts', () => {
    expect(selectionComicAnchor(selection({ id: 'rain', kind: 'text' }, rain, 12, 'Wind howls. Rain'), timeline)).toBe('rain/p0/s1');
  });

  it('is counted in the part of a line between inline chips that the caret is in', () => {
    const words = 'Listen. Thunder. It stopped.';
    const caret = selection({ id: 'storm', kind: 'text', parts: [{ index: 2, quote: '', occurrence: 0 }] }, words, 20);
    expect(selectionComicAnchor(caret, timeline)).toBe('storm/p2/s0');
    const before = selection({ id: 'storm', kind: 'text', parts: [{ index: 0, quote: '', occurrence: 0 }] }, words, 9);
    expect(selectionComicAnchor(before, timeline)).toBe('storm/p0/s1');
  });

  it('is found in a line of dialogue', () => {
    expect(selectionComicAnchor(selection({ id: 'line', kind: 'dialogue' }, 'Who is there? Answer me!', 16), timeline)).toBe('line/p0/s1');
  });

  it('is found far into a long block, past the 300 characters the editor tells of', () => {
    const start = long.indexOf('Line 33');
    expect(selectionComicAnchor(selection({ id: 'long', kind: 'text' }, long, start + 3), timeline)).toBe('long/p0/s32');
  });

  it('is found past a line break, which the editor\'s frame tells of as no text at all', () => {
    const caret = { blocks: [{ id: 'lines', kind: 'text' as const, quote: '', occurrence: 0 }], before: 'One fell.Where now? ', after: 'How so?' };
    expect(selectionComicAnchor(caret, timeline)).toBe('lines/p0/s2');
  });

  it('is none in a block of no words, or one the scene does not have', () => {
    expect(selectionComicAnchor({ blocks: [], before: '', after: '' }, timeline)).toBeNull();
    expect(selectionComicAnchor(selection({ id: 'pick', kind: 'choice' }, '', 0), timeline)).toBeNull();
    expect(selectionComicAnchor(selection({ id: 'gone', kind: 'text' }, 'Gone.', 0), timeline)).toBeNull();
  });
});
