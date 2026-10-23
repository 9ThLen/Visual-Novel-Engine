/**
 * The reading session: one comic strip across scenes read as comics one after
 * another (docs/plans/COMIC-MODE-PLAN.md, sections 2 and 5.1).
 *
 * Each scene has a run of its own, which ends when the scene does; the strip
 * must not. So the session keeps the pages of the comic scenes already read
 * and puts the current scene's after them. A scene read as the novel ends the
 * strip, and the next comic scene starts a new one.
 *
 * A scene is a segment of the strip. Its panels are kept under the key of the
 * visit, so two visits of one scene never share a panel id. A segment the
 * reader has left keeps the panels that were open and the answer to the choice
 * it ended on, which the strip shows where it was made. Going back from the
 * start of a scene replays the scene before it from its first step, so both
 * the current segment and the one before it leave the strip.
 *
 * Plain TypeScript, no React and no store.
 */
import type { ComicFrameChoices } from '@/lib/comic/comic-frame-protocol';
import type { ComicPagePlan, ComicPanel } from '@/lib/comic/comic-layout';

export interface ComicSessionSegment {
  /** The visit's key. */
  key: string;
  plan: ComicPagePlan;
  /** How many of its panels are open. */
  revealed: number;
  /** The choice the scene ends on, answered or not. */
  choices: ComicFrameChoices | null;
}

export interface ComicSessionState {
  /** Comic scenes already read, oldest first. */
  past: ComicSessionSegment[];
  current: ComicSessionSegment | null;
}

export type ComicSessionAction =
  /** The current scene's segment as it now is: a new visit, or a change to the one on screen. */
  | { type: 'publish'; segment: ComicSessionSegment }
  /** The scene was left for the next one. */
  | { type: 'end'; key: string }
  /** The reader went back from the start of the scene to the scene before it. */
  | { type: 'rollBack'; key: string }
  /** The strip ends: a scene read as the novel, or a save loaded. */
  | { type: 'clear' };

export const EMPTY_COMIC_SESSION: ComicSessionState = { past: [], current: null };

export function comicSessionReducer(state: ComicSessionState, action: ComicSessionAction): ComicSessionState {
  switch (action.type) {
    case 'publish': {
      const { segment } = action;
      if (state.current?.key === segment.key) return { ...state, current: segment };
      // A visit that ended and comes straight back (React mounts twice in
      // development) takes its place again instead of being kept twice.
      const last = state.past[state.past.length - 1];
      const past = !state.current && last?.key === segment.key ? state.past.slice(0, -1) : state.past;
      return { past: state.current ? [...past, state.current] : past, current: segment };
    }
    case 'end':
      if (state.current?.key !== action.key) return state;
      return { past: [...state.past, state.current], current: null };
    case 'rollBack':
      if (state.current?.key !== action.key) return state;
      return { past: state.past.slice(0, -1), current: null };
    case 'clear':
      return state.past.length || state.current ? EMPTY_COMIC_SESSION : state;
  }
}

export interface ComicSessionView {
  /** Every segment's panels in reading order, under keys of their own. */
  plan: ComicPagePlan;
  revealed: number;
  /** The current scene's choice, at the end of the strip. */
  choices: ComicFrameChoices | null;
  /** Choices earlier scenes ended on, under the last panel of each. */
  panelChoices: Record<string, ComicFrameChoices>;
}

function keyed(key: string, panel: ComicPanel): ComicPanel {
  return { ...panel, id: `${key}/${panel.id}` };
}

/** The strip the frame draws for a session. */
export function composeComicSession(state: ComicSessionState): ComicSessionView {
  const panels: ComicPanel[] = [];
  const panelChoices: Record<string, ComicFrameChoices> = {};
  for (const segment of state.past) {
    const open = segment.plan.panels.slice(0, Math.max(0, segment.revealed)).map((panel) => keyed(segment.key, panel));
    panels.push(...open);
    const last = open[open.length - 1];
    if (last && segment.choices?.chosenId) panelChoices[last.id] = segment.choices;
  }
  const before = panels.length;
  const current = state.current;
  if (current) panels.push(...current.plan.panels.map((panel) => keyed(current.key, panel)));
  return {
    plan: { panels },
    revealed: before + (current ? Math.max(0, Math.min(current.plan.panels.length, current.revealed)) : 0),
    choices: current?.choices ?? null,
    panelChoices,
  };
}
