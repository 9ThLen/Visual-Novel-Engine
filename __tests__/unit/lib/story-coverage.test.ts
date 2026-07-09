import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  EMPTY_STORY_COVERAGE,
  computeCoverageReport,
  getChoiceStats,
  incrementChoiceCount,
  loadCoverage,
  recordChoiceTaken,
  recordSceneVisit,
  resetChoiceAnalytics,
  saveCoverage,
} from '@/lib/story-coverage';

function makeStep(overrides: Partial<TimelineStep> & { id: string; blockType: TimelineStep['blockType'] }): TimelineStep {
  const defaults: Record<TimelineStep['blockType'], TimelineStep['data']> = {
    background: { assetId: null, transition: 'instant', duration: 0 },
    character: {
      action: 'show',
      characterId: 'hero',
      spriteId: 'hero-idle',
      position: 'left',
      transition: 'instant',
      delay: 0,
      duration: null,
    },
    text: { content: 'Hello.', typewriterSpeed: 0.5, anchorTo: 'background' },
    dialogue: {
      entries: [{ id: 'entry-1', characterId: 'hero', spriteId: 'hero-idle', text: 'Hello.' }],
      currentEntryIndex: 0,
    },
    choice: { options: [] },
    effect: { effectType: 'flash', target: 'screen', intensity: 20, duration: 1 },
    music: { mode: 'silence', assetId: null, volume: 1, loop: false, fadeIn: 0, fadeOut: 0, boundTo: 'scene' },
    sound: { mode: 'silence', assetId: null, volume: 1, loop: false, fadeIn: 0, fadeOut: 0, pitchVariation: 0 },
    interactive_object: {
      objectId: 'object-1',
      name: 'Object',
      assetId: null,
      position: { x: 0, y: 0, width: 10, height: 10 },
      actions: [],
      oneTimeOnly: false,
      pulseAnimation: false,
    },
    camera: { action: 'reset', duration: 0, easing: 'linear' },
    variable: { variableName: 'flag', operation: 'set', value: true },
    transition: { mode: 'end', targetSceneId: null, transitionType: 'fade', duration: 0.2 },
  };

  return {
    collapsed: false,
    enabled: true,
    data: defaults[overrides.blockType],
    ...overrides,
  } as TimelineStep;
}

function makeScene(overrides: Partial<SceneRecord> & { id: string }): SceneRecord {
  return {
    storyId: 'story-1',
    name: overrides.id,
    timeline: [makeStep({ id: 'end', blockType: 'transition' })],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    description: '',
    tags: [],
    connections: [],
    isStart: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('story coverage', () => {
  it('dedupes repeated scene visits', () => {
    const coverage = recordSceneVisit(recordSceneVisit(EMPTY_STORY_COVERAGE, 'start'), 'start');
    const report = computeCoverageReport([makeScene({ id: 'start', isStart: true })], coverage);

    expect(coverage.visitedSceneIds).toEqual(['start']);
    expect(report.visitedReachableScenes).toBe(1);
    expect(report.sceneCoveragePercent).toBe(100);
    expect(report.totalCoveragePercent).toBe(100);
  });

  it('increments choice counts without deduping repeated picks', () => {
    const coverage = incrementChoiceCount(
      incrementChoiceCount(EMPTY_STORY_COVERAGE, 'start', 'choice-1', 'left'),
      'start',
      'choice-1',
      'left',
    );

    expect(coverage.choiceCounts.start['choice-1'].left).toBe(2);
  });

  it('computes total coverage across reachable scenes and choice options', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({
            id: 'choice-1',
            blockType: 'choice',
            data: {
              options: [
                { id: 'left', text: 'Left', targetSceneId: null },
                { id: 'right', text: 'Right', targetSceneId: null },
              ],
            },
          }),
        ],
      }),
    ];
    const coverage = recordChoiceTaken(recordSceneVisit(EMPTY_STORY_COVERAGE, 'start'), 'start', 'choice-1', 'left');

    const report = computeCoverageReport(scenes, coverage);

    expect(report.sceneCoveragePercent).toBe(100);
    expect(report.choiceCoveragePercent).toBe(50);
    expect(report.totalCoveragePercent).toBe(67);
  });

  it('computes choice statistics with zero-count options and percentages that sum to 100', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({
            id: 'choice-1',
            blockType: 'choice',
            data: {
              options: [
                { id: 'a', text: 'A', targetSceneId: null },
                { id: 'b', text: 'B', targetSceneId: null },
                { id: 'c', text: 'C', targetSceneId: null },
                { id: 'd', text: 'D', targetSceneId: null },
              ],
            },
          }),
        ],
      }),
    ];
    let coverage = EMPTY_STORY_COVERAGE;
    coverage = incrementChoiceCount(coverage, 'start', 'choice-1', 'a');
    coverage = incrementChoiceCount(coverage, 'start', 'choice-1', 'b');
    coverage = incrementChoiceCount(coverage, 'start', 'choice-1', 'c');

    const report = getChoiceStats(scenes, coverage);
    const options = report.scenes[0].steps[0].options;

    expect(options.map((option) => option.count)).toEqual([1, 1, 1, 0]);
    expect(options.reduce((sum, option) => sum + option.percentage, 0)).toBe(100);
    expect(options.find((option) => option.optionId === 'd')).toEqual(
      expect.objectContaining({ optionText: 'D', count: 0, percentage: 0 }),
    );
  });

  it('excludes unreachable scenes from unvisited scenes', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        connections: [{ targetSceneId: 'next', outputPort: 'next' }],
      }),
      makeScene({ id: 'next' }),
      makeScene({ id: 'orphan' }),
    ];

    const report = computeCoverageReport(scenes, recordSceneVisit(EMPTY_STORY_COVERAGE, 'start'));

    expect(report.totalReachableScenes).toBe(2);
    expect(report.unvisitedScenes.map((scene) => scene.sceneId)).toEqual(['next']);
  });

  it('ignores stale taken choice entries for removed options', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({
            id: 'choice-1',
            blockType: 'choice',
            data: { options: [{ id: 'kept', text: 'Kept option', targetSceneId: null }] },
          }),
        ],
      }),
    ];
    const coverage = recordChoiceTaken(EMPTY_STORY_COVERAGE, 'start', 'choice-1', 'deleted');

    const report = computeCoverageReport(scenes, coverage);

    expect(report.takenChoiceOptions).toBe(0);
    expect(report.neverTakenChoices).toEqual([
      expect.objectContaining({ optionId: 'kept', optionText: 'Kept option' }),
    ]);
  });

  it('ignores stale counted option ids for removed options in choice statistics', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({
            id: 'choice-1',
            blockType: 'choice',
            data: { options: [{ id: 'kept', text: 'Kept option', targetSceneId: null }] },
          }),
        ],
      }),
    ];
    const coverage = incrementChoiceCount(EMPTY_STORY_COVERAGE, 'start', 'choice-1', 'deleted');

    const report = getChoiceStats(scenes, coverage);

    expect(report.totalPicks).toBe(0);
    expect(report.scenes[0].steps[0].options).toEqual([
      expect.objectContaining({ optionId: 'kept', count: 0, percentage: 0 }),
    ]);
  });

  it('roundtrips load/save, resets analytics, and returns empty coverage for corrupt JSON', async () => {
    const storage = makeStorage();
    const coverage = incrementChoiceCount(
      recordChoiceTaken(recordSceneVisit(EMPTY_STORY_COVERAGE, 'start'), 'start', 'choice-1', 'a'),
      'start',
      'choice-1',
      'a',
    );

    await saveCoverage(storage, 'story-1', coverage);
    await expect(loadCoverage(storage, 'story-1')).resolves.toEqual(coverage);

    await resetChoiceAnalytics(storage, 'story-1');
    await expect(loadCoverage(storage, 'story-1')).resolves.toEqual(EMPTY_STORY_COVERAGE);

    const key = Array.from(storage.values.keys())[0];
    storage.values.set(key, '{not-json');

    await expect(loadCoverage(storage, 'story-1')).resolves.toEqual(EMPTY_STORY_COVERAGE);
  });
});
