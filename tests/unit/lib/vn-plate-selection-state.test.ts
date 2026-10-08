import { SELECTION_STATE_LIMITS, sanitizeSelectionState } from '@/lib/vn-plate-editor/selection-state';

describe('sanitizeSelectionState', () => {
  const valid = {
    seq: 3,
    collapsed: false,
    text: 'почався. Він',
    textLength: 12,
    truncated: false,
    before: 'Дощ ',
    after: ' не вщухав.',
    crossesChip: true,
    blocks: [{
      id: 'blk_chip',
      kind: 'text',
      quote: 'почався. Він',
      occurrence: 0,
      parts: [{ index: 0, quote: 'почався. ', occurrence: 0 }, { index: 2, quote: 'Він', occurrence: 0 }],
    }],
  };

  it('passes a well-formed state through unchanged', () => {
    expect(sanitizeSelectionState(valid)).toEqual(valid);
  });

  it('rejects anything that is not a selection state', () => {
    expect(sanitizeSelectionState(null)).toBeNull();
    expect(sanitizeSelectionState('selection')).toBeNull();
    expect(sanitizeSelectionState({ ...valid, seq: 'three' })).toBeNull();
  });

  it('applies the limits itself instead of trusting the frame', () => {
    const state = sanitizeSelectionState({
      ...valid,
      text: 'я'.repeat(SELECTION_STATE_LIMITS.text + 10),
      textLength: 2,
      before: 'а'.repeat(SELECTION_STATE_LIMITS.surroundingText + 10),
      blocks: Array.from({ length: SELECTION_STATE_LIMITS.blocks + 5 }, (_, index) => ({
        id: `block_${index}`,
        kind: 'text',
        quote: 'x',
        occurrence: 0,
      })),
    });

    expect(state?.text).toHaveLength(SELECTION_STATE_LIMITS.text);
    expect(state?.textLength).toBe(SELECTION_STATE_LIMITS.text);
    expect(state?.before).toHaveLength(SELECTION_STATE_LIMITS.surroundingText);
    expect(state?.blocks).toHaveLength(SELECTION_STATE_LIMITS.blocks);
  });

  it('drops blocks and parts it cannot address', () => {
    const state = sanitizeSelectionState({
      ...valid,
      blocks: [
        { id: 'void', kind: 'choice', quote: 'x', occurrence: 0 },
        { kind: 'text', quote: 'no id', occurrence: 0 },
        { id: 'kept', kind: 'dialogue', quote: 12, occurrence: -1, parts: [{ index: -1, quote: 'x' }, { index: 1, quote: 'y', occurrence: 2 }] },
      ],
    });

    expect(state?.blocks).toEqual([
      { id: 'kept', kind: 'dialogue', quote: '', occurrence: 0, parts: [{ index: 1, quote: 'y', occurrence: 2 }] },
    ]);
  });
});
