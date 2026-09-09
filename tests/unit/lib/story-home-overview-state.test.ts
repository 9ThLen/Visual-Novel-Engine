import {
  buildOverviewState,
  verdictTone,
  type OverviewInput,
  type OverviewTileKey,
} from '@/lib/story-home/overview-state';

function input(overrides: Partial<OverviewInput> = {}): OverviewInput {
  return {
    hydrated: true,
    readiness: { blockers: 0, warnings: 0, missing: [] },
    doctor: { errors: 0, warnings: 0 },
    coverage: { scenesSeen: 0, scenesTotal: 14 },
    assets: { total: 10, unused: 0, broken: 0 },
    ...overrides,
  };
}

function tile(state: ReturnType<typeof buildOverviewState>, key: OverviewTileKey) {
  const found = state.tiles.find((item) => item.key === key);
  if (!found) throw new Error(`no tile ${key}`);
  return found;
}

describe('the verdict names the worst thing', () => {
  it('puts errors above everything else', () => {
    const state = buildOverviewState(
      input({
        doctor: { errors: 52, warnings: 39 },
        readiness: { blockers: 53, warnings: 39, missing: ['releasePreflight.issue.missingCover'] },
      }),
    );
    expect(state.verdict).toEqual({ kind: 'errors', count: 52 });
    expect(verdictTone(state.verdict)).toBe('danger');
  });

  it('falls to warnings when nothing is broken', () => {
    const state = buildOverviewState(input({ doctor: { errors: 0, warnings: 39 } }));
    expect(state.verdict).toEqual({ kind: 'warnings', count: 39 });
  });

  it('names what the release still needs when the script is clean', () => {
    const state = buildOverviewState(
      input({
        readiness: {
          blockers: 2,
          warnings: 0,
          missing: ['releasePreflight.issue.missingCover', 'releasePreflight.issue.missingDescription'],
        },
      }),
    );
    expect(state.verdict).toEqual({
      kind: 'incomplete',
      missing: ['releasePreflight.issue.missingCover', 'releasePreflight.issue.missingDescription'],
    });
  });

  it('says ready only when every check passes', () => {
    expect(buildOverviewState(input()).verdict).toEqual({ kind: 'ready' });
  });

  it('says nothing at all while the scenes are still loading', () => {
    const state = buildOverviewState(input({ hydrated: false, doctor: { errors: 52, warnings: 0 } }));
    expect(state.verdict).toEqual({ kind: 'pending' });
    expect(state.tiles.every((item) => item.value === null && !item.expandable)).toBe(true);
  });
});

describe('tiles', () => {
  it('shows blockers first, then warnings, then a clean zero', () => {
    const blocked = tile(
      buildOverviewState(input({ readiness: { blockers: 25, warnings: 3, missing: [] } })),
      'readiness',
    );
    expect(blocked).toMatchObject({ value: '25', tone: 'danger', expandable: true });

    const warned = tile(
      buildOverviewState(input({ readiness: { blockers: 0, warnings: 3, missing: [] } })),
      'readiness',
    );
    expect(warned).toMatchObject({ value: '3', tone: 'warning', expandable: true });

    const clean = tile(buildOverviewState(input()), 'readiness');
    expect(clean).toMatchObject({ value: '0', tone: 'ok', expandable: false });
  });

  it('says nothing before the gate has run', () => {
    const unknown = tile(buildOverviewState(input({ readiness: null })), 'readiness');
    expect(unknown).toMatchObject({ value: null, tone: 'none', expandable: false });
  });

  it('shows errors first, then warnings, then zero', () => {
    expect(tile(buildOverviewState(input({ doctor: { errors: 3, warnings: 9 } })), 'health')).toMatchObject({
      value: '3',
      tone: 'danger',
      expandable: true,
    });
    expect(tile(buildOverviewState(input({ doctor: { errors: 0, warnings: 9 } })), 'health')).toMatchObject({
      value: '9',
      tone: 'warning',
    });
    expect(tile(buildOverviewState(input()), 'health')).toMatchObject({
      value: '0',
      tone: 'ok',
      expandable: false,
    });
  });

  it('counts unvisited scenes as a fact, not a verdict', () => {
    const untouched = tile(buildOverviewState(input()), 'coverage');
    expect(untouched.value).toBe('0/14');
    expect(untouched.tone).toBe('none');
    // The list of scenes nobody has reached is the point of opening it.
    expect(untouched.expandable).toBe(true);

    const played = tile(
      buildOverviewState(input({ coverage: { scenesSeen: 4, scenesTotal: 14 } })),
      'coverage',
    );
    expect(played.value).toBe('4/14');
    expect(played.tone).toBe('neutral');
    expect(played.expandable).toBe(true);
  });

  it('has nothing to open when no scene is reachable', () => {
    const none = tile(
      buildOverviewState(input({ coverage: { scenesSeen: 0, scenesTotal: 0 } })),
      'coverage',
    );
    expect(none.value).toBeNull();
    expect(none.expandable).toBe(false);
  });

  it('marks coverage done when every reachable scene was seen', () => {
    const state = buildOverviewState(input({ coverage: { scenesSeen: 14, scenesTotal: 14 } }));
    expect(tile(state, 'coverage').tone).toBe('ok');
  });

  it('does not call a choice-less story unplayed once its scenes were seen', () => {
    // A linear story records visits but never a pick, so the tile must key off
    // scenes rather than choices.
    const state = buildOverviewState(input({ coverage: { scenesSeen: 3, scenesTotal: 3 } }));
    expect(tile(state, 'coverage').tone).toBe('ok');
  });

  it('reports broken references before the library size', () => {
    expect(tile(buildOverviewState(input({ assets: { total: 10, unused: 2, broken: 59 } })), 'assets')).toMatchObject({
      value: '59',
      tone: 'danger',
    });
    expect(tile(buildOverviewState(input({ assets: { total: 10, unused: 2, broken: 0 } })), 'assets')).toMatchObject({
      value: '10',
      tone: 'warning',
    });
    expect(tile(buildOverviewState(input({ assets: { total: 10, unused: 0, broken: 0 } })), 'assets')).toMatchObject({
      value: '10',
      tone: 'ok',
    });
  });

  it('has nothing to open when the library is empty', () => {
    const empty = tile(buildOverviewState(input({ assets: { total: 0, unused: 0, broken: 0 } })), 'assets');
    expect(empty.value).toBeNull();
    expect(empty.expandable).toBe(false);
  });

  it('always returns the four tiles in a stable order', () => {
    expect(buildOverviewState(input()).tiles.map((item) => item.key)).toEqual([
      'readiness',
      'health',
      'coverage',
      'assets',
    ]);
  });
});
