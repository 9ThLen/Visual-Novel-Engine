/**
 * lib/story-home/overview-state.ts — the project page's state band, as data.
 *
 * The page used to show two verdicts side by side that never referred to each
 * other: a green «4 of 5 ready» beside «52 errors». They come from different
 * checks, so instead of averaging them into a fake score this module names the
 * worst thing once and lets the four reports keep their own tiles.
 *
 * Pure — no zustand, no react — so the rules are testable and the screen only
 * renders what comes back. Same split as `lib/editor/story-library.ts`.
 */

export type OverviewTileKey = 'readiness' | 'health' | 'coverage' | 'assets';

/** `none` is «nothing measured yet», not «nothing wrong». */
export type OverviewTone = 'ok' | 'warning' | 'danger' | 'neutral' | 'none';

export interface OverviewTile {
  key: OverviewTileKey;
  /** Null renders as «—»: the report has nothing to say yet. */
  value: string | null;
  tone: OverviewTone;
  /** False when opening the panel would show an empty box. */
  expandable: boolean;
}

export type OverviewVerdict =
  | { kind: 'pending' }
  | { kind: 'errors'; count: number }
  | { kind: 'warnings'; count: number }
  | { kind: 'incomplete'; missing: string[] }
  | { kind: 'ready' };

export interface OverviewInput {
  /** False while the scene graph is still loading — every number would be a guess. */
  hydrated: boolean;
  /**
   * The release gate's verdict, or null before it has run.
   *
   * This used to be a five-item checklist over `validateSceneGraph`. It is the
   * release preflight now, because two readiness answers on one page could only
   * disagree — a green checklist beside fifty-two errors was the complaint that
   * started this recomposition (STORY-HOME-PLAN.md §2.4).
   */
  readiness: {
    blockers: number;
    warnings: number;
    /**
     * i18n keys for the blockers the story doctor did not raise — the passport
     * facts a release needs. They are what «still to do» lists.
     */
    missing: string[];
  } | null;
  doctor: { errors: number; warnings: number };
  coverage: {
    /** How many reachable scenes a playthrough has actually seen. */
    scenesSeen: number;
    scenesTotal: number;
  };
  assets: { total: number; unused: number; broken: number };
}

export interface OverviewState {
  verdict: OverviewVerdict;
  tiles: OverviewTile[];
}

function readinessTile(input: OverviewInput): OverviewTile {
  const gate = input.readiness;
  if (!gate) return { key: 'readiness', value: null, tone: 'none', expandable: false };
  // Same idiom as the health tile: the number is whatever is worst, and the
  // line under it says which kind it is.
  if (gate.blockers > 0) {
    return { key: 'readiness', value: String(gate.blockers), tone: 'danger', expandable: true };
  }
  if (gate.warnings > 0) {
    return { key: 'readiness', value: String(gate.warnings), tone: 'warning', expandable: true };
  }
  return { key: 'readiness', value: '0', tone: 'ok', expandable: false };
}

function healthTile(input: OverviewInput): OverviewTile {
  const { errors, warnings } = input.doctor;
  if (errors > 0) {
    return { key: 'health', value: String(errors), tone: 'danger', expandable: true };
  }
  if (warnings > 0) {
    return { key: 'health', value: String(warnings), tone: 'warning', expandable: true };
  }
  return { key: 'health', value: '0', tone: 'ok', expandable: false };
}

function coverageTile(input: OverviewInput): OverviewTile {
  const { scenesSeen, scenesTotal } = input.coverage;
  // Nothing reachable to walk through — there is no report behind this tile.
  if (scenesTotal <= 0) {
    return { key: 'coverage', value: null, tone: 'none', expandable: false };
  }
  return {
    key: 'coverage',
    value: `${scenesSeen}/${scenesTotal}`,
    // Scenes seen, not choices picked: a story with no choices at all would
    // otherwise read as unplayed forever. Before the first visit «0/12» is a
    // fact rather than a verdict, so the tile stays grey — but the list of
    // scenes nobody has reached is still worth opening.
    tone: scenesSeen <= 0 ? 'none' : scenesSeen >= scenesTotal ? 'ok' : 'neutral',
    expandable: true,
  };
}

function assetsTile(input: OverviewInput): OverviewTile {
  const { total, unused, broken } = input.assets;
  if (broken > 0) {
    return { key: 'assets', value: String(broken), tone: 'danger', expandable: true };
  }
  if (total === 0) {
    return { key: 'assets', value: null, tone: 'none', expandable: false };
  }
  return {
    key: 'assets',
    value: String(total),
    tone: unused > 0 ? 'warning' : 'ok',
    expandable: true,
  };
}

const PENDING_TILE_KEYS: OverviewTileKey[] = ['readiness', 'health', 'coverage', 'assets'];

export function buildOverviewState(input: OverviewInput): OverviewState {
  if (!input.hydrated) {
    return {
      verdict: { kind: 'pending' },
      tiles: PENDING_TILE_KEYS.map((key) => ({ key, value: null, tone: 'none', expandable: false })),
    };
  }

  const tiles = [readinessTile(input), healthTile(input), coverageTile(input), assetsTile(input)];
  const missing = input.readiness?.missing ?? [];

  // Worst first: a broken script outranks an unfinished passport, and both
  // outrank silence.
  let verdict: OverviewVerdict;
  if (input.doctor.errors > 0) verdict = { kind: 'errors', count: input.doctor.errors };
  else if (input.doctor.warnings > 0) verdict = { kind: 'warnings', count: input.doctor.warnings };
  else if (missing.length > 0) verdict = { kind: 'incomplete', missing };
  else verdict = { kind: 'ready' };

  return { verdict, tiles };
}

/** The dot beside the verdict, and nothing else — tiles carry their own tone. */
export function verdictTone(verdict: OverviewVerdict): OverviewTone {
  switch (verdict.kind) {
    case 'errors':
      return 'danger';
    case 'warnings':
      return 'warning';
    case 'incomplete':
      return 'neutral';
    case 'ready':
      return 'ok';
    default:
      return 'none';
  }
}
