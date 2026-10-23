import { buildExecutedComicPlan } from '@/lib/comic/comic-layout';
import { comicStopsFromJournal, currentStopPanels, openedInStop } from '@/lib/comic/comic-reading';
import type { ExecutionJournalEntry, JournalSceneSnapshot } from '@/lib/engine/useSceneExecutor';
import type { TimelineStep } from '@/lib/engine/types';

function step(id: string, blockType: TimelineStep['blockType'], data: Record<string, unknown>): TimelineStep {
  return { id, blockType, data, collapsed: false, enabled: true } as unknown as TimelineStep;
}

const snapshot: JournalSceneSnapshot = {
  backgroundAssetId: 'hall',
  backgroundTransition: 'fade',
  characters: [],
  activeEffects: [],
  currentChoices: null,
};

function entry(executionId: number, stepIndex: number, stepId: string, blockType: TimelineStep['blockType']): ExecutionJournalEntry {
  return { executionId, stepIndex, stepId, blockType, snapshot };
}

const timeline = [
  step('para', 'text', { content: 'One. Two. Three.', typewriterSpeed: 0.5, anchorTo: 'background' }),
  step('line', 'dialogue', { entries: [{ id: 'e1', characterId: 'ann', text: 'Hi.', spriteId: 's' }], currentEntryIndex: 0 }),
  step('pick', 'choice', { options: [{ id: 'a', text: 'A', targetSceneId: null }] }),
];

describe('reading a scene as a comic', () => {
  it('takes the stops from the journal, in order, with their ids as strings', () => {
    const stops = comicStopsFromJournal(timeline, [entry(4, 0, 'para', 'text'), entry(9, 1, 'line', 'dialogue')]);
    expect(stops.map((stop) => [stop.executionId, stop.step.id])).toEqual([['4', 'para'], ['9', 'line']]);
    expect(stops[0].state).toBe(snapshot);
  });

  it('leaves out a stop whose step is no longer where it was', () => {
    expect(comicStopsFromJournal(timeline, [entry(1, 0, 'gone', 'text'), entry(2, 7, 'line', 'dialogue')])).toEqual([]);
  });

  it('finds the panels the current stop brings: from its first to the end', () => {
    const plan = buildExecutedComicPlan(timeline, comicStopsFromJournal(timeline, [
      entry(1, 0, 'para', 'text'),
      entry(2, 1, 'line', 'dialogue'),
    ]));
    const paragraph = currentStopPanels(plan, '1');
    const line = currentStopPanels(plan, '2');

    expect(paragraph.first).toBe(0);
    expect(line.first + line.count).toBe(plan.panels.length);
    expect(line.first).toBeGreaterThan(0);
  });

  it('finds none for a stop without words, or with no stop at all', () => {
    const plan = buildExecutedComicPlan(timeline, comicStopsFromJournal(timeline, [
      entry(1, 0, 'para', 'text'),
      entry(3, 2, 'pick', 'choice'),
    ]));
    expect(currentStopPanels(plan, '3')).toEqual({ first: plan.panels.length, count: 0 });
    expect(currentStopPanels(plan, null)).toEqual({ first: plan.panels.length, count: 0 });
  });

  it('keeps at least one panel of a stop open, and never more than it has', () => {
    expect(openedInStop({ count: 3 }, 0)).toBe(1);
    expect(openedInStop({ count: 3 }, 2)).toBe(2);
    expect(openedInStop({ count: 3 }, Infinity)).toBe(3);
    expect(openedInStop({ count: 0 }, 5)).toBe(0);
  });
});
