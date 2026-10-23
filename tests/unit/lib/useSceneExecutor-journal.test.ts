import { act, renderHook, waitFor } from '@testing-library/react';
import type { TimelineStep } from '@/lib/engine/types';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';

// The journal's contract (docs/plans/COMIC-MODE-PLAN.md, section 5.1): a new
// stop adds an entry, a finished typewriter adds nothing, a rollback takes back
// what it undoes, a restart clears it.

function step(id: string, blockType: TimelineStep['blockType'], data: Record<string, unknown>, extra: Partial<TimelineStep> = {}): TimelineStep {
  return { id, blockType, data, collapsed: false, enabled: true, ...extra } as TimelineStep;
}

const text = (id: string, content = id) => step(id, 'text', { content, typewriterSpeed: 0.5, anchorTo: 'background' });
const background = (id: string, assetId: string) => step(id, 'background', { assetId, transition: 'fade', duration: 0 });
const character = (id: string, characterId: string, spriteId: string) =>
  step(id, 'character', { characterId, spriteId, action: 'show', position: 'left' });
const label = (id: string, name: string) => step(id, 'label', { name });
const addOne = (id: string, variableName: string) => step(id, 'variable', { variableName, operation: 'add', value: 1 });
const choice = (id: string) => step(id, 'choice', {
  options: [{ id: 'left', text: 'Left', targetSceneId: null }, { id: 'right', text: 'Right', targetSceneId: null }],
});

type Executor = { current: ReturnType<typeof useSceneExecutor> };

async function advancePast(result: Executor) {
  if (result.current.isTyping) {
    act(() => result.current.advance());
    await waitFor(() => expect(result.current.isTyping).toBe(false));
  }
  act(() => result.current.advance());
}

const stepIds = (result: Executor) => result.current.journal.map((entry) => entry.stepId);
const executionIds = (result: Executor) => result.current.journal.map((entry) => entry.executionId);

describe('the execution journal', () => {
  it('starts with the first stop and adds one entry for each stop after it', async () => {
    const { result } = renderHook(() => useSceneExecutor([text('a'), text('b')]));
    await waitFor(() => expect(stepIds(result)).toEqual(['a']));

    await advancePast(result);

    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'b']));
    expect(result.current.journal.map((entry) => entry.stepIndex)).toEqual([0, 1]);
    expect(result.current.journal.map((entry) => entry.blockType)).toEqual(['text', 'text']);
    expect(new Set(executionIds(result)).size).toBe(2);
  });

  it('adds nothing when the typewriter finishes', async () => {
    const { result } = renderHook(() => useSceneExecutor([text('a'), text('b')]));
    await waitFor(() => expect(result.current.isTyping).toBe(true));
    const before = result.current.journal;

    act(() => result.current.advance());

    await waitFor(() => expect(result.current.isTyping).toBe(false));
    expect(result.current.journal).toEqual(before);
  });

  it('keeps what could be seen at each stop, which later stops do not change', async () => {
    const { result } = renderHook(() => useSceneExecutor([
      background('bg-1', 'hall'), character('show-ann', 'ann', 'ann-smile'), text('a'),
      background('bg-2', 'garden'), text('b'),
    ]));
    await waitFor(() => expect(stepIds(result)).toEqual(['a']));
    await advancePast(result);
    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'b']));

    const [first, second] = result.current.journal;
    expect(first.snapshot.backgroundAssetId).toBe('hall');
    expect(first.snapshot.characters.map((c) => [c.characterId, c.spriteId, c.position])).toEqual([['ann', 'ann-smile', 'left']]);
    expect(second.snapshot.backgroundAssetId).toBe('garden');
  });

  it('lists a step reached again by a backward goto as a new execution', async () => {
    const { result } = renderHook(() => useSceneExecutor([
      label('top', 'top'),
      text('a'),
      addOne('count', 'visits'),
      step('again', 'goto', { targetLabel: 'top', condition: { variableName: 'visits', operator: '<', value: 2 } }),
      text('b'),
    ]));
    await waitFor(() => expect(stepIds(result)).toEqual(['a']));
    await advancePast(result);
    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'a']));
    await advancePast(result);

    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'a', 'b']));
    expect(new Set(executionIds(result)).size).toBe(3);
  });

  it('leaves out steps that did not run', async () => {
    const { result } = renderHook(() => useSceneExecutor([
      text('a'),
      text('off', 'Switched off'),
      text('gated', 'Needs a key'),
      text('b'),
    ].map((item) => (item.id === 'off' ? { ...item, enabled: false } : item.id === 'gated'
      ? { ...item, conditions: [{ variableName: 'key', operator: '==' as const, value: true }] }
      : item))));
    await waitFor(() => expect(stepIds(result)).toEqual(['a']));
    await advancePast(result);

    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'b']));
  });

  it('takes back the stops a rollback undoes, and gives the step reached again a new id', async () => {
    const { result } = renderHook(() => useSceneExecutor([text('a'), text('b'), text('c')]));
    await waitFor(() => expect(stepIds(result)).toEqual(['a']));
    await advancePast(result);
    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'b']));
    await advancePast(result);
    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'b', 'c']));
    const cut = result.current.journal[2].executionId;

    act(() => result.current.rollback());

    expect(stepIds(result)).toEqual(['a', 'b']);
    await advancePast(result);
    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'b', 'c']));
    expect(result.current.journal[2].executionId).not.toBe(cut);
  });

  it('keeps every stop of a scene longer than the rollback stack, and still cuts it on rollback', async () => {
    const timeline = Array.from({ length: 150 }, (_, index) => text(`line-${index}`));
    const { result } = renderHook(() => useSceneExecutor(timeline));
    await waitFor(() => expect(result.current.journal).toHaveLength(1));
    for (let index = 1; index < timeline.length; index += 1) {
      await advancePast(result);
    }
    await waitFor(() => expect(result.current.journal).toHaveLength(150));
    expect(stepIds(result)).toEqual(timeline.map((item) => item.id));

    act(() => result.current.rollback());

    expect(result.current.journal).toHaveLength(149);
    expect(result.current.journal.at(-1)?.stepId).toBe('line-148');
  });

  it('clears it when the run restarts, as a loaded save restarts it', async () => {
    const timeline = [text('a'), text('b')];
    const { result, rerender } = renderHook(({ resetKey }) => useSceneExecutor(timeline, { resetKey }), {
      initialProps: { resetKey: 1 },
    });
    await waitFor(() => expect(stepIds(result)).toEqual(['a']));
    await advancePast(result);
    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'b']));
    const before = executionIds(result);

    rerender({ resetKey: 2 });

    await waitFor(() => expect(stepIds(result)).toEqual(['a']));
    expect(before).not.toContain(result.current.journal[0].executionId);
  });

  it('ends on a choice that remembers the option picked', async () => {
    const { result } = renderHook(() => useSceneExecutor([text('a'), choice('pick')]));
    await waitFor(() => expect(stepIds(result)).toEqual(['a']));
    await advancePast(result);
    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'pick']));
    expect(result.current.journal[1].snapshot.currentChoices?.map((option) => option.id)).toEqual(['left', 'right']);

    act(() => result.current.selectChoice('right'));

    expect(result.current.journal.map((entry) => entry.chosenOptionId)).toEqual([undefined, 'right']);
  });

  it('takes back a choice when the player rolls back from it', async () => {
    const { result } = renderHook(() => useSceneExecutor([text('a'), choice('pick')]));
    await waitFor(() => expect(stepIds(result)).toEqual(['a']));
    await advancePast(result);
    await waitFor(() => expect(stepIds(result)).toEqual(['a', 'pick']));

    act(() => result.current.rollback());

    expect(stepIds(result)).toEqual(['a']);
  });
});
