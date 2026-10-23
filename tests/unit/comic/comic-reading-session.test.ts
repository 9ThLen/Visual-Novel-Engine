import type { ComicPagePlan, ComicPanel } from '@/lib/comic/comic-layout';
import {
  comicSessionReducer,
  composeComicSession,
  EMPTY_COMIC_SESSION,
  type ComicSessionAction,
  type ComicSessionSegment,
  type ComicSessionState,
} from '@/lib/comic/comic-reading-session';

function plan(...ids: string[]): ComicPagePlan {
  return {
    panels: ids.map((id) => ({
      id,
      anchor: `${id}/p0/s0`,
      picture: { backgroundAssetId: null, characters: [], camera: null, effects: [] },
      framing: { shot: 'wide', zoom: 1, subject: { x: 0.5, y: 0.5 }, placement: { x: 0.5, y: 0.5 }, characterIds: [] },
      elements: [],
      textWeight: 0,
    }) as ComicPanel),
  };
}

/** A scene's segment; with `chosenId`, it ended on a choice answered that way. */
function segment(key: string, ids: string[], revealed = ids.length, chosenId: string | null = null): ComicSessionSegment {
  const choices = chosenId === null ? null : { options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], chosenId };
  return { key, plan: plan(...ids), revealed, choices };
}

function run(...actions: ComicSessionAction[]): ComicSessionState {
  return actions.reduce(comicSessionReducer, EMPTY_COMIC_SESSION);
}

describe('the reading session', () => {
  it('puts the next comic scene after the one it left', () => {
    const state = run(
      { type: 'publish', segment: segment('v1', ['p1', 'p2']) },
      { type: 'end', key: 'v1' },
      { type: 'publish', segment: segment('v2', ['p1', 'p2', 'p3'], 1) },
    );
    const view = composeComicSession(state);

    expect(view.plan.panels.map((panel) => panel.id)).toEqual(['v1/p1', 'v1/p2', 'v2/p1', 'v2/p2', 'v2/p3']);
    expect(view.revealed).toBe(3);
  });

  it('keeps of a scene left only the panels that were open', () => {
    const state = run(
      { type: 'publish', segment: segment('v1', ['p1', 'p2', 'p3'], 2) },
      { type: 'end', key: 'v1' },
      { type: 'publish', segment: segment('v2', ['q1'], 1) },
    );
    expect(composeComicSession(state).plan.panels.map((panel) => panel.id)).toEqual(['v1/p1', 'v1/p2', 'v2/q1']);
  });

  it('shows the answer a scene ended on under its last panel, and the current scene\'s choice at the end', () => {
    const state = run(
      { type: 'publish', segment: segment('v1', ['p1', 'p2'], 2, 'b') },
      { type: 'end', key: 'v1' },
      { type: 'publish', segment: { ...segment('v2', ['q1']), choices: { options: [{ id: 'x', text: 'X' }], chosenId: null } } },
    );
    const view = composeComicSession(state);

    expect(view.panelChoices).toEqual({ 'v1/p2': expect.objectContaining({ chosenId: 'b' }) });
    expect(view.choices).toEqual({ options: [{ id: 'x', text: 'X' }], chosenId: null });
  });

  it('gives two visits of one scene panels of their own', () => {
    const state = run(
      { type: 'publish', segment: segment('v1', ['p1']) },
      { type: 'end', key: 'v1' },
      { type: 'publish', segment: segment('v2', ['p1']) },
    );
    expect(composeComicSession(state).plan.panels.map((panel) => panel.id)).toEqual(['v1/p1', 'v2/p1']);
  });

  it('takes the scene and the one before it off the strip when the reader goes back from its start', () => {
    const state = run(
      { type: 'publish', segment: segment('v1', ['p1']) },
      { type: 'end', key: 'v1' },
      { type: 'publish', segment: segment('v2', ['q1']) },
      { type: 'end', key: 'v2' },
      { type: 'publish', segment: segment('v3', ['r1']) },
      { type: 'rollBack', key: 'v3' },
      { type: 'end', key: 'v3' },
    );
    expect(state).toEqual({ past: [expect.objectContaining({ key: 'v1' })], current: null });
  });

  it('takes a visit that comes straight back after ending as itself, not twice', () => {
    const state = run(
      { type: 'publish', segment: segment('v1', ['p1']) },
      { type: 'end', key: 'v1' },
      { type: 'publish', segment: segment('v1', ['p1']) },
    );
    expect(state.past).toEqual([]);
    expect(state.current?.key).toBe('v1');
  });

  it('ignores the end or the rollback of a visit that is not the current one', () => {
    const before = run({ type: 'publish', segment: segment('v2', ['q1']) });
    expect(comicSessionReducer(before, { type: 'end', key: 'v1' })).toBe(before);
    expect(comicSessionReducer(before, { type: 'rollBack', key: 'v1' })).toBe(before);
  });

  it('ends the strip on clear', () => {
    const state = run({ type: 'publish', segment: segment('v1', ['p1']) }, { type: 'end', key: 'v1' }, { type: 'clear' });
    expect(state).toBe(EMPTY_COMIC_SESSION);
    expect(composeComicSession(state)).toEqual({ plan: { panels: [] }, revealed: 0, choices: null, panelChoices: {} });
  });
});
