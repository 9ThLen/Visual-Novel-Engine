import { parseAiEditorContext, type AiEditorContext } from '@/lib/ai/editor-context';
import {
  buildEditorContextFromCapture,
  clipQuote,
  countWords,
  describeEditorContextPointer,
  describeLiveEditorPointer,
  focusBlockNameKey,
  type EditorContextCapture,
} from '@/lib/ai/editor-context-capture';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { createDocumentTechnicalBlock, sceneRecordToDocumentScene } from '@/lib/document-editor/document-scene';
import type { DocumentScene } from '@/lib/document-editor/types';
import { saveDocumentSceneToRecord } from '@/lib/document-scene-persistence';
import type { SceneRecord } from '@/lib/engine/types';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';

function emptyScene(): SceneRecord {
  return {
    id: 'scene_1',
    storyId: 'story_1',
    name: 'Бібліотека',
    description: '',
    tags: [],
    timeline: [],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

/** A stored scene and the document a frame would hand back for it. */
function savedScene() {
  const background = createDocumentTechnicalBlock('background');
  const typed: DocumentScene = {
    sceneId: 'scene_1',
    sceneName: 'Бібліотека',
    blocks: [background, { id: 'blk_text', kind: 'text', content: 'Дощ почався. Він не вщухав.' }],
  };
  const normalized = normalizePlateDocumentScene(typed, []);
  const scene = saveDocumentSceneToRecord(emptyScene(), normalized.scene, normalized.characters);
  return { scene, document: sceneRecordToDocumentScene(scene) };
}

function selectionOf(document: DocumentScene, extra: Partial<VNPlateSelectionState> = {}): VNPlateSelectionState {
  const text = document.blocks.find((block) => block.kind === 'text' && block.content)!;
  return {
    seq: 1,
    collapsed: false,
    text: 'Дощ почався',
    textLength: 11,
    truncated: false,
    before: '',
    after: '. Він не вщухав.',
    crossesChip: false,
    blocks: [{ id: text.id, kind: 'text', quote: 'Дощ почався', occurrence: 0 }],
    ...extra,
  };
}

function captureOf(document: DocumentScene | null, selection: VNPlateSelectionState | null): EditorContextCapture {
  return {
    sceneId: 'scene_1',
    sceneSource: selection ? 'selection' : 'scroll',
    document,
    selection,
    hasUnsavedChanges: false,
    activePathSceneIds: ['scene_1'],
  };
}

function build(capture: EditorContextCapture, scene: SceneRecord | null, kind: AiEditorContext['kind'] = 'fixed') {
  return buildEditorContextFromCapture({
    storyId: 'story_1', capture, kind, scene, characters: [], snapshotId: 'ctx_1', capturedAt: 1,
  });
}

describe('buildEditorContextFromCapture', () => {
  it('addresses the captured selection to the stored step and stamps the scene revision', () => {
    const { scene, document } = savedScene();

    const context = build(captureOf(document, selectionOf(document)), scene);

    expect(parseAiEditorContext(context).ok).toBe(true);
    expect(context).toMatchObject({
      kind: 'fixed',
      scene: { id: 'scene_1', name: 'Бібліотека', revision: computeSceneRevision(scene), source: 'selection' },
      selection: { sceneId: 'scene_1', text: 'Дощ почався' },
    });
    const [anchor] = context.selection!.anchors;
    expect(anchor).toMatchObject({ match: 'exact', quote: 'Дощ почався' });
    expect(scene.timeline.find((step) => step.id === anchor.stepId)?.blockType).toBe('text');
  });

  it('names the step of the block in focus along with the selection', () => {
    const { scene, document } = savedScene();
    const block = document.blocks.find((item) => item.kind === 'technical')!;
    const selection = selectionOf(document, {
      collapsed: true, text: '', textLength: 0, blocks: [],
      focus: { id: block.id, kind: 'technical', command: 'background', state: 'editing' },
    });

    const context = build(captureOf(document, selection), scene);

    expect(context.selection).toBeNull();
    expect(context.focus).toMatchObject({ blockType: 'background', match: 'exact', state: 'editing' });
    expect(parseAiEditorContext(context).ok).toBe(true);
  });

  // The frame had scrolled away: there is text to quote but no document to
  // pair it with, so the address can only be a search.
  it('never claims an exact address without the frame’s document', () => {
    const { scene, document } = savedScene();

    const context = build(captureOf(null, selectionOf(document)), scene);

    expect(context.selection?.anchors[0].match).toBe('quote');
  });

  it('describes a place and nothing more when the scene is gone', () => {
    const { document } = savedScene();

    const context = build(captureOf(document, selectionOf(document)), null);

    expect(context).toMatchObject({ scene: null, selection: null });
    expect(context).not.toHaveProperty('focus');
    expect(parseAiEditorContext(context).ok).toBe(true);
  });

  it('passes on that a live read saw unsaved work', () => {
    const { scene, document } = savedScene();

    const context = build({ ...captureOf(document, null), hasUnsavedChanges: true }, scene, 'live');

    expect(context).toMatchObject({ kind: 'live', hasUnsavedChanges: true, scene: { source: 'scroll' } });
  });
});

describe('what a context points at', () => {
  const { scene, document } = savedScene();

  it('is the selected text, clipped, with how much of it there is', () => {
    const long = 'слово '.repeat(40).trim();
    const pointer = describeEditorContextPointer(build(captureOf(document, selectionOf(document, { text: long })), scene));

    expect(pointer).toMatchObject({ kind: 'selection', words: 40 });
    expect(pointer.kind === 'selection' && pointer.quote.length).toBeLessThanOrEqual(80);
    expect(pointer.kind === 'selection' && pointer.quote.endsWith('…')).toBe(true);
  });

  it('says so when a selection could not be placed exactly', () => {
    const exact = describeEditorContextPointer(build(captureOf(document, selectionOf(document)), scene));
    const searched = describeEditorContextPointer(build(captureOf(null, selectionOf(document)), scene));

    expect(exact).toMatchObject({ kind: 'selection', exact: true });
    expect(searched).toMatchObject({ kind: 'selection', exact: false });
  });

  // A click on a block leaves a caret in some paragraph; the author means the block.
  it('is the block in hand when the selection is only a caret', () => {
    const block = document.blocks.find((item) => item.kind === 'technical')!;
    const caretAndFocus = selectionOf(document, {
      collapsed: true, text: '', textLength: 0,
      focus: { id: block.id, kind: 'technical', command: 'background', state: 'recent' },
    });

    expect(describeEditorContextPointer(build(captureOf(document, caretAndFocus), scene)))
      .toMatchObject({ kind: 'focus', blockType: 'background', state: 'recent', exact: true });
    expect(describeLiveEditorPointer(caretAndFocus)).toEqual({ kind: 'focus', command: 'background', state: 'recent' });
  });

  // Text selected earlier stays highlighted behind an open settings popover;
  // the popover is what the author is doing now.
  it('is the block whose settings are open, even over selected text', () => {
    const block = document.blocks.find((item) => item.kind === 'technical')!;
    const focusOn = (state: 'editing' | 'selected' | 'recent') => selectionOf(document, {
      focus: { id: block.id, kind: 'technical', command: 'background', state },
    });

    expect(describeLiveEditorPointer(focusOn('editing'))).toMatchObject({ kind: 'focus', state: 'editing' });
    expect(describeEditorContextPointer(build(captureOf(document, focusOn('editing')), scene))).toMatchObject({ kind: 'focus', state: 'editing' });
    for (const state of ['selected', 'recent'] as const) {
      expect(describeLiveEditorPointer(focusOn(state))).toMatchObject({ kind: 'selection' });
      expect(describeEditorContextPointer(build(captureOf(document, focusOn(state)), scene))).toMatchObject({ kind: 'selection' });
    }
  });

  it('is nothing for a bare caret', () => {
    const caret = selectionOf(document, { collapsed: true, text: '', textLength: 0 });

    expect(describeEditorContextPointer(build(captureOf(document, caret), scene))).toEqual({ kind: 'none' });
    expect(describeLiveEditorPointer(caret)).toEqual({ kind: 'none' });
    expect(describeLiveEditorPointer(null)).toEqual({ kind: 'none' });
  });

  it('reads the same before sending as after', () => {
    const live = describeLiveEditorPointer(selectionOf(document, { truncated: true }));

    expect(live).toEqual({ kind: 'selection', quote: 'Дощ почався', words: 2, truncated: true });
  });
});

describe('helpers', () => {
  it('names a block from the editor’s word for it or from its step type', () => {
    expect(focusBlockNameKey('stopEffect')).toBe('aiChat.context.block.stopEffect');
    expect(focusBlockNameKey('stop_effect')).toBe('aiChat.context.block.stopEffect');
    expect(focusBlockNameKey('interactive_object')).toBe('aiChat.context.block.interactiveObject');
    expect(focusBlockNameKey('something_new')).toBe('aiChat.context.block.other');
  });

  it('flattens and clips a quote, and counts words across line breaks', () => {
    expect(clipQuote('  Один\n\nдва   три ')).toBe('Один два три');
    expect(clipQuote('абвгд', 4)).toBe('абв…');
    expect(countWords('Один\nдва  три')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});
