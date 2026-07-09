import { validateSceneGraph } from '@/lib/document-editor/scene-graph-validator';
import type { ChoiceBlockData, SceneRecord } from '@/lib/engine/types';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export interface TakenChoice {
  sceneId: string;
  stepId: string;
  optionId: string;
}

export interface StoryCoverage {
  visitedSceneIds: string[];
  takenChoices: TakenChoice[];
  choiceCounts: ChoiceCounts;
}

export type ChoiceCounts = Record<string, Record<string, Record<string, number>>>;

export interface UnvisitedSceneCoverageItem {
  sceneId: string;
  sceneName: string;
}

export interface NeverTakenChoiceCoverageItem {
  sceneId: string;
  sceneName: string;
  stepId: string;
  optionId: string;
  optionText: string;
}

export interface CoverageReport {
  totalReachableScenes: number;
  visitedReachableScenes: number;
  sceneCoveragePercent: number;
  totalChoiceOptions: number;
  takenChoiceOptions: number;
  choiceCoveragePercent: number;
  totalCoveragePercent: number;
  unvisitedScenes: UnvisitedSceneCoverageItem[];
  neverTakenChoices: NeverTakenChoiceCoverageItem[];
}

export interface ChoiceStatsOption {
  optionId: string;
  optionText: string;
  count: number;
  percentage: number;
}

export interface ChoiceStatsStep {
  sceneId: string;
  sceneName: string;
  stepId: string;
  totalPicks: number;
  options: ChoiceStatsOption[];
}

export interface ChoiceStatsScene {
  sceneId: string;
  sceneName: string;
  steps: ChoiceStatsStep[];
}

export interface ChoiceStatsReport {
  totalPicks: number;
  scenes: ChoiceStatsScene[];
}

export type CoverageStorageLike = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
};

interface StoryCoveragePayload {
  version: 1;
  coverage: StoryCoverage;
}

const CURRENT_VERSION = 1;

export const EMPTY_STORY_COVERAGE: StoryCoverage = {
  visitedSceneIds: [],
  takenChoices: [],
  choiceCounts: {},
};

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
}

function choiceKey(choice: TakenChoice): string {
  return `${choice.sceneId}\u0000${choice.stepId}\u0000${choice.optionId}`;
}

function dedupeChoices(values: TakenChoice[]): TakenChoice[] {
  const seen = new Set<string>();
  const result: TakenChoice[] = [];
  for (const choice of values) {
    if (
      !choice
      || typeof choice.sceneId !== 'string'
      || typeof choice.stepId !== 'string'
      || typeof choice.optionId !== 'string'
      || !choice.sceneId
      || !choice.stepId
      || !choice.optionId
    ) {
      continue;
    }
    const key = choiceKey(choice);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(choice);
  }
  return result;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeChoiceCounts(value: unknown): ChoiceCounts {
  if (!isPlainRecord(value)) return {};
  const counts: ChoiceCounts = {};

  for (const [sceneId, sceneValue] of Object.entries(value)) {
    if (!sceneId || !isPlainRecord(sceneValue)) continue;
    const sceneCounts: Record<string, Record<string, number>> = {};

    for (const [stepId, stepValue] of Object.entries(sceneValue)) {
      if (!stepId || !isPlainRecord(stepValue)) continue;
      const stepCounts: Record<string, number> = {};

      for (const [optionId, countValue] of Object.entries(stepValue)) {
        if (!optionId || typeof countValue !== 'number' || !Number.isFinite(countValue) || countValue <= 0) {
          continue;
        }
        stepCounts[optionId] = Math.floor(countValue);
      }

      if (Object.keys(stepCounts).length > 0) sceneCounts[stepId] = stepCounts;
    }

    if (Object.keys(sceneCounts).length > 0) counts[sceneId] = sceneCounts;
  }

  return counts;
}

function normalizeCoverage(value: unknown): StoryCoverage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_STORY_COVERAGE;
  const record = value as Partial<StoryCoverage>;
  return {
    visitedSceneIds: dedupeStrings(Array.isArray(record.visitedSceneIds) ? record.visitedSceneIds : []),
    takenChoices: dedupeChoices(Array.isArray(record.takenChoices) ? record.takenChoices : []),
    choiceCounts: normalizeChoiceCounts(record.choiceCounts),
  };
}

function coverageStorageKey(storyId: string): string {
  return STORAGE_KEYS.STORY_COVERAGE(storyId);
}

export function recordSceneVisit(coverage: StoryCoverage, sceneId: string): StoryCoverage {
  if (!sceneId) return normalizeCoverage(coverage);
  return normalizeCoverage({
    ...coverage,
    visitedSceneIds: [...coverage.visitedSceneIds, sceneId],
  });
}

export function recordChoiceTaken(
  coverage: StoryCoverage,
  sceneId: string,
  stepId: string,
  optionId: string,
): StoryCoverage {
  if (!sceneId || !stepId || !optionId) return normalizeCoverage(coverage);
  return normalizeCoverage({
    ...coverage,
    takenChoices: [...coverage.takenChoices, { sceneId, stepId, optionId }],
  });
}

export function incrementChoiceCount(
  coverage: StoryCoverage,
  sceneId: string,
  stepId: string,
  optionId: string,
): StoryCoverage {
  const normalized = normalizeCoverage(coverage);
  if (!sceneId || !stepId || !optionId) return normalized;
  const current = normalized.choiceCounts[sceneId]?.[stepId]?.[optionId] ?? 0;

  return normalizeCoverage({
    ...normalized,
    choiceCounts: {
      ...normalized.choiceCounts,
      [sceneId]: {
        ...normalized.choiceCounts[sceneId],
        [stepId]: {
          ...normalized.choiceCounts[sceneId]?.[stepId],
          [optionId]: current + 1,
        },
      },
    },
  });
}

function reachableSceneIds(scenes: SceneRecord[]): Set<string> {
  const unreachable = new Set(
    validateSceneGraph(scenes)
      .filter((issue) => issue.type === 'unreachableScene')
      .map((issue) => issue.sceneId),
  );
  return new Set(scenes.filter((scene) => !unreachable.has(scene.id)).map((scene) => scene.id));
}

function percent(done: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((done / total) * 100);
}

function optionPercentages(counts: number[], total: number): number[] {
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((count) => (count / total) * 100);
  const roundedDown = raw.map(Math.floor);
  let remainder = 100 - roundedDown.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    roundedDown[order[i].index] += 1;
    remainder -= 1;
  }

  return roundedDown;
}

export function getChoiceStats(scenes: SceneRecord[], coverage: StoryCoverage): ChoiceStatsReport {
  const normalized = normalizeCoverage(coverage);
  const reportScenes: ChoiceStatsScene[] = [];
  let totalPicks = 0;

  for (const scene of scenes) {
    const steps: ChoiceStatsStep[] = [];
    const sceneName = scene.name || scene.id;

    for (const step of scene.timeline ?? []) {
      if (step.enabled === false || step.blockType !== 'choice') continue;
      const data = step.data as ChoiceBlockData;
      const options = data.options ?? [];
      const optionCounts = options.map((option) => normalized.choiceCounts[scene.id]?.[step.id]?.[option.id] ?? 0);
      const stepTotal = optionCounts.reduce((sum, value) => sum + value, 0);
      const percentages = optionPercentages(optionCounts, stepTotal);

      steps.push({
        sceneId: scene.id,
        sceneName,
        stepId: step.id,
        totalPicks: stepTotal,
        options: options.map((option, index) => ({
          optionId: option.id,
          optionText: option.text || option.id,
          count: optionCounts[index],
          percentage: percentages[index],
        })),
      });
      totalPicks += stepTotal;
    }

    if (steps.length > 0) {
      reportScenes.push({
        sceneId: scene.id,
        sceneName,
        steps,
      });
    }
  }

  return {
    totalPicks,
    scenes: reportScenes,
  };
}

export function computeCoverageReport(scenes: SceneRecord[], coverage: StoryCoverage): CoverageReport {
  const normalized = normalizeCoverage(coverage);
  const reachableIds = reachableSceneIds(scenes);
  const visitedIds = new Set(normalized.visitedSceneIds);
  const takenKeys = new Set(normalized.takenChoices.map(choiceKey));

  const reachableScenes = scenes.filter((scene) => reachableIds.has(scene.id));
  const unvisitedScenes = reachableScenes
    .filter((scene) => !visitedIds.has(scene.id))
    .map((scene) => ({
      sceneId: scene.id,
      sceneName: scene.name || scene.id,
    }));

  const neverTakenChoices: NeverTakenChoiceCoverageItem[] = [];
  let totalChoiceOptions = 0;
  let takenChoiceOptions = 0;

  for (const scene of reachableScenes) {
    for (const step of scene.timeline ?? []) {
      if (step.enabled === false || step.blockType !== 'choice') continue;
      const data = step.data as ChoiceBlockData;
      for (const option of data.options ?? []) {
        const key = choiceKey({ sceneId: scene.id, stepId: step.id, optionId: option.id });
        totalChoiceOptions += 1;
        if (takenKeys.has(key)) {
          takenChoiceOptions += 1;
        } else {
          neverTakenChoices.push({
            sceneId: scene.id,
            sceneName: scene.name || scene.id,
            stepId: step.id,
            optionId: option.id,
            optionText: option.text || option.id,
          });
        }
      }
    }
  }

  const visitedReachableScenes = reachableScenes.filter((scene) => visitedIds.has(scene.id)).length;
  const totalCoverableItems = reachableScenes.length + totalChoiceOptions;
  const coveredItems = visitedReachableScenes + takenChoiceOptions;

  return {
    totalReachableScenes: reachableScenes.length,
    visitedReachableScenes,
    sceneCoveragePercent: percent(visitedReachableScenes, reachableScenes.length),
    totalChoiceOptions,
    takenChoiceOptions,
    choiceCoveragePercent: percent(takenChoiceOptions, totalChoiceOptions),
    totalCoveragePercent: percent(coveredItems, totalCoverableItems),
    unvisitedScenes,
    neverTakenChoices,
  };
}

export async function loadCoverage(storage: CoverageStorageLike, storyId: string): Promise<StoryCoverage> {
  try {
    const raw = await storage.getItem(coverageStorageKey(storyId));
    if (!raw) return EMPTY_STORY_COVERAGE;
    const parsed = JSON.parse(raw) as Partial<StoryCoveragePayload>;
    if (!parsed || parsed.version !== CURRENT_VERSION) return EMPTY_STORY_COVERAGE;
    return normalizeCoverage(parsed.coverage);
  } catch {
    return EMPTY_STORY_COVERAGE;
  }
}

/**
 * Persist coverage. Errors propagate to the caller so failures can surface
 * (e.g. the reset flow's failure toast). Fire-and-forget callers that don't
 * care about write failures should attach their own `.catch()`.
 */
export async function saveCoverage(
  storage: CoverageStorageLike,
  storyId: string,
  coverage: StoryCoverage,
): Promise<void> {
  const payload: StoryCoveragePayload = {
    version: CURRENT_VERSION,
    coverage: normalizeCoverage(coverage),
  };
  await storage.setItem(coverageStorageKey(storyId), JSON.stringify(payload));
}

export const loadChoiceAnalytics = loadCoverage;
export const saveChoiceAnalytics = saveCoverage;

export async function resetChoiceAnalytics(storage: CoverageStorageLike, storyId: string): Promise<void> {
  await saveCoverage(storage, storyId, EMPTY_STORY_COVERAGE);
}
