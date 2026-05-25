/**
 * test-undo-redo.ts — Validates the existing undo/redo infrastructure in useEditorStore
 *
 * Run: npx vitest run .planning/spikes/002-editor-undo-redo/test-undo-redo.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/stores/use-editor-store';
import type { TimelineStep, BlockType } from '@/lib/engine/types';
import { createBlockStep } from '@/lib/engine/event-factory';

function makeStep(overrides: Partial<TimelineStep> = {}): TimelineStep {
  return { id: `test-${Math.random()}`, blockType: 'text', data: { content: '', typewriterSpeed: 0.5, anchorTo: 'background' }, collapsed: false, enabled: true, ...overrides };
}

describe('Editor Undo/Redo', () => {
  beforeEach(() => {
    useEditorStore.setState({
      sceneId: null, sceneName: '', timeline: [], isDirty: false,
      selectedBlockId: null, _undoStack: [], _redoStack: [],
    } as any);
  });

  it('undo restores previous timeline after addBlock', () => {
    const store = useEditorStore.getState();
    store.setScene('s1', 'Test', [makeStep({ id: 'a' }), makeStep({ id: 'b' })]);
    expect(useEditorStore.getState().timeline).toHaveLength(2);

    useEditorStore.getState().addBlock('text');
    expect(useEditorStore.getState().timeline).toHaveLength(3);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().timeline).toHaveLength(2);
    expect(useEditorStore.getState().timeline[0].id).toBe('a');
  });

  it('redo restores after undo', () => {
    useEditorStore.getState().setScene('s1', 'Test', [makeStep({ id: 'a' })]);
    useEditorStore.getState().addBlock('text');
    const afterAdd = useEditorStore.getState().timeline.map(s => s.id);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().timeline).toHaveLength(1);

    useEditorStore.getState().redo();
    const afterRedo = useEditorStore.getState().timeline.map(s => s.id);
    expect(afterRedo).toEqual(afterAdd);
  });

  it('removeBlock is undoable', () => {
    const s1 = makeStep({ id: 'a' }); const s2 = makeStep({ id: 'b' }); const s3 = makeStep({ id: 'c' });
    useEditorStore.getState().setScene('s1', 'Test', [s1, s2, s3]);
    useEditorStore.getState().removeBlock('b');
    expect(useEditorStore.getState().timeline.map(s => s.id)).toEqual(['a', 'c']);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().timeline.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('moveBlock is undoable', () => {
    const s1 = makeStep({ id: 'a', blockType: 'text' }); const s2 = makeStep({ id: 'b', blockType: 'choice' }); const s3 = makeStep({ id: 'c', blockType: 'effect' });
    useEditorStore.getState().setScene('s1', 'Test', [s1, s2, s3]);

    // Move 'a' from 0 to 2
    useEditorStore.getState().moveBlock(0, 2);
    expect(useEditorStore.getState().timeline.map(s => s.id)).toEqual(['b', 'c', 'a']);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().timeline.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('duplicateBlock is undoable', () => {
    useEditorStore.getState().setScene('s1', 'Test', [makeStep({ id: 'a' }), makeStep({ id: 'b' })]);
    useEditorStore.getState().duplicateBlock('a');

    expect(useEditorStore.getState().timeline).toHaveLength(3);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().timeline).toHaveLength(2);
  });

  it('updateBlock is undoable', () => {
    useEditorStore.getState().setScene('s1', 'Test', [makeStep({ id: 'a', data: { content: 'hello', typewriterSpeed: 0.5, anchorTo: 'background' } })]);
    useEditorStore.getState().updateBlock('a', { data: { content: 'world', typewriterSpeed: 0.5, anchorTo: 'background' } });

    expect((useEditorStore.getState().timeline[0].data as any).content).toBe('world');

    useEditorStore.getState().undo();
    expect((useEditorStore.getState().timeline[0].data as any).content).toBe('hello');
  });

  it('new action clears redo stack', () => {
    useEditorStore.getState().setScene('s1', 'Test', [makeStep({ id: 'a' })]);
    useEditorStore.getState().addBlock('text');
    useEditorStore.getState().undo();
    expect(useEditorStore.getState()._redoStack).toHaveLength(1);

    useEditorStore.getState().addBlock('choice');
    expect(useEditorStore.getState()._redoStack).toHaveLength(0);
  });

  it('no-op undo when stack empty', () => {
    const initialState = useEditorStore.getState();
    initialState.undo();
    expect(useEditorStore.getState().timeline).toEqual([]);
  });

  it('MAX_UNDO_HISTORY is respected', () => {
    useEditorStore.getState().setScene('s1', 'Test', [makeStep({ id: 'initial' })]);
    for (let i = 0; i < 150; i++) {
      useEditorStore.getState().addBlock('text');
    }
    expect(useEditorStore.getState()._undoStack.length).toBeLessThanOrEqual(100);
  });

  it('clearTimeline is undoable', () => {
    useEditorStore.getState().setScene('s1', 'Test', [makeStep({ id: 'a' }), makeStep({ id: 'b' })]);
    useEditorStore.getState().clearTimeline();
    expect(useEditorStore.getState().timeline).toHaveLength(0);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().timeline).toHaveLength(2);
  });

  it('selectors work: selectCanUndo / selectCanRedo', () => {
    const { selectCanUndo, selectCanRedo } = require('@/stores/use-editor-store');
    expect(selectCanUndo(useEditorStore.getState())).toBe(false);
    expect(selectCanRedo(useEditorStore.getState())).toBe(false);

    useEditorStore.getState().addBlock('text');
    expect(selectCanUndo(useEditorStore.getState())).toBe(true);

    useEditorStore.getState().undo();
    expect(selectCanRedo(useEditorStore.getState())).toBe(true);
  });
});
