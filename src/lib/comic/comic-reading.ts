/**
 * Reading a scene as a comic: what has been read, from the scene's execution
 * journal, and how far into the current stop the reader has got
 * (docs/plans/COMIC-MODE-PLAN.md, sections 5.1 and 5.3).
 *
 * The executor stops at a step; the comic may make several panels of it — a
 * paragraph is a caption per sentence. The reader opens those one tap at a
 * time, the novel's pages within a step, and only then asks the executor for
 * the next stop. Back goes the same way in reverse: a panel of this stop, then
 * the executor's rollback, which takes the stop off the journal.
 *
 * Plain TypeScript, no React and no store.
 */
import type { ComicExecutedStop, ComicPagePlan } from '@/lib/comic/comic-layout';
import type { ExecutionJournalEntry } from '@/lib/engine/useSceneExecutor';
import type { TimelineStep } from '@/lib/engine/types';

/**
 * The journal as the page plan takes it. An entry whose step is no longer at
 * its place in the timeline is left out: the timeline changed under the run,
 * which restarts it anyway.
 */
export function comicStopsFromJournal(
  timeline: readonly TimelineStep[],
  journal: readonly ExecutionJournalEntry[],
): ComicExecutedStop[] {
  const stops: ComicExecutedStop[] = [];
  for (const entry of journal) {
    const step = timeline[entry.stepIndex];
    if (!step || step.id !== entry.stepId) continue;
    stops.push({ executionId: String(entry.executionId), step, state: entry.snapshot });
  }
  return stops;
}

/**
 * The panels the current stop brings: from the first panel holding any of its
 * words to the end of the plan, since the current stop is the last. A panel
 * the previous line shares with it is one of them, already open. A stop
 * without words (a choice) brings none.
 */
export function currentStopPanels(plan: ComicPagePlan, executionId: string | null): { first: number; count: number } {
  const first = executionId === null
    ? -1
    : plan.panels.findIndex((panel) => panel.elements.some((element) => element.executionId === executionId));
  if (first < 0) return { first: plan.panels.length, count: 0 };
  return { first, count: plan.panels.length - first };
}

/**
 * How many of the current stop's panels are open: at least one when it has
 * any, never more than it has. `opened` is the reader's count, which may be
 * `Infinity` for "all of them" (landing on a stop by rollback, as the novel
 * lands on the last page of a block).
 */
export function openedInStop(stop: { count: number }, opened: number): number {
  if (stop.count === 0) return 0;
  return Math.max(1, Math.min(stop.count, opened));
}
