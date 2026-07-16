/**
 * lib/showcase/story-showcase.ts — pure showcase domain.
 *
 * Turns persisted stories into the shape the consumer-facing showcase renders:
 * a teaser hook, honest reading metrics and mood shelves. No zustand, no react —
 * everything here is a function of its arguments so the screens stay dumb.
 *
 * Block payloads come from user data and imports, so every reader below checks
 * the shape structurally and skips what it cannot understand.
 */

import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';

export type ShowcaseBannerEffect = 'rain' | 'snow' | 'fog';

export interface ShowcaseProgressInput {
  latestSave: { sceneId: string; timestamp: number } | null;
  /** Ids of terminal scenes the reader has already reached. */
  endingsReached: string[];
}

export interface ShowcaseStory {
  id: string;
  title: string;
  author: string | null;
  coverUri: string | null;
  teaser: string | null;
  tags: string[];
  readMinutes: number;
  endingsTotal: number;
  endingsSeen: number;
  branchCount: number;
  bannerEffect: ShowcaseBannerEffect | null;
  bannerBackgroundAssetId: string | null;
  hasStarted: boolean;
  isFinished: boolean;
  lastSaveTimestamp: number | null;
  lastSceneId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ShowcaseShelves {
  hero: ShowcaseStory | null;
  continueReading: ShowcaseStory[];
  quickReads: ShowcaseStory[];
  fresh: ShowcaseStory[];
  unexplored: ShowcaseStory[];
  all: ShowcaseStory[];
}

const TEASER_MAX_CHARS = 140;
const WORDS_PER_MINUTE = 180;
const QUICK_READ_MAX_MINUTES = 15;
const FRESH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** A themed shelf holding a single card reads as emptier than no shelf at all. */
const MIN_SHELF_SIZE = 2;

const BANNER_EFFECTS: readonly ShowcaseBannerEffect[] = ['rain', 'snow', 'fog'];

const FALLBACK_COLORS = [
  '#2d2a54', // indigo
  '#12463c', // emerald
  '#4a1d2b', // bordeaux
  '#26262e', // graphite
  '#152a4d', // deep blue
  '#3a1f4d', // violet
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function enabledSteps(scene: SceneRecord | undefined): TimelineStep[] {
  if (!scene || !Array.isArray(scene.timeline)) return [];
  return scene.timeline.filter((step) => isRecord(step) && step.enabled !== false);
}

function findScene(scenes: SceneRecord[], sceneId: string): SceneRecord | undefined {
  return scenes.find((scene) => scene?.id === sceneId);
}

function dialogueTexts(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data.entries)) return [];
  return data.entries
    .filter(isRecord)
    .map((entry) => (typeof entry.text === 'string' ? entry.text : ''))
    .filter((text) => text.trim().length > 0);
}

function textContent(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const content = data.content;
  return typeof content === 'string' && content.trim().length > 0 ? content : null;
}

function choiceTexts(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data.options)) return [];
  return data.options
    .filter(isRecord)
    .map((option) => (typeof option.text === 'string' ? option.text : ''))
    .filter((text) => text.trim().length > 0);
}

function truncateOnWordBoundary(raw: string, maxChars: number): string {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  const head = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped;
  return `${head.replace(/[.,;:!?—-]+$/, '')}…`;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * The hook shown under a title: the story's own first spoken line, falling back
 * to its first narration. Dialogue wins because a voice pulls harder than prose.
 */
export function extractTeaser(scenes: SceneRecord[], startSceneId: string): string | null {
  const steps = enabledSteps(findScene(scenes, startSceneId));

  for (const step of steps) {
    if (step.blockType !== 'dialogue') continue;
    const [first] = dialogueTexts(step.data);
    if (first) return truncateOnWordBoundary(first, TEASER_MAX_CHARS);
  }

  for (const step of steps) {
    if (step.blockType !== 'text') continue;
    const content = textContent(step.data);
    if (content) return truncateOnWordBoundary(content, TEASER_MAX_CHARS);
  }

  return null;
}

export function estimateReadMinutes(scenes: SceneRecord[]): number {
  let words = 0;

  for (const scene of scenes) {
    for (const step of enabledSteps(scene)) {
      if (step.blockType === 'dialogue') {
        words += dialogueTexts(step.data).reduce((sum, text) => sum + countWords(text), 0);
      } else if (step.blockType === 'text') {
        words += countWords(textContent(step.data) ?? '');
      } else if (step.blockType === 'choice') {
        words += choiceTexts(step.data).reduce((sum, text) => sum + countWords(text), 0);
      }
    }
  }

  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

function terminalSceneIds(scenes: SceneRecord[]): string[] {
  return scenes
    .filter((scene) => !Array.isArray(scene?.connections) || scene.connections.length === 0)
    .map((scene) => scene.id);
}

/** A story always has at least one ending: a pure loop still stops somewhere. */
export function countEndings(scenes: SceneRecord[]): number {
  return Math.max(1, terminalSceneIds(scenes).length);
}

export function countBranches(scenes: SceneRecord[]): number {
  return scenes.filter((scene) => {
    if (Array.isArray(scene?.connections) && scene.connections.length >= 2) return true;
    return enabledSteps(scene).some(
      (step) => step.blockType === 'choice' && choiceTexts(step.data).length >= 2,
    );
  }).length;
}

/** Only weather effects can be replayed by the banner; the rest need the reader. */
export function pickBannerEffect(
  scenes: SceneRecord[],
  startSceneId: string,
): ShowcaseBannerEffect | null {
  for (const step of enabledSteps(findScene(scenes, startSceneId))) {
    if (step.blockType !== 'effect' || !isRecord(step.data)) continue;
    const effectType = step.data.effectType;
    const match = BANNER_EFFECTS.find((candidate) => candidate === effectType);
    if (match) return match;
  }
  return null;
}

export function firstBackgroundAssetId(scenes: SceneRecord[], startSceneId: string): string | null {
  for (const step of enabledSteps(findScene(scenes, startSceneId))) {
    if (step.blockType !== 'background' || !isRecord(step.data)) continue;
    const assetId = step.data.assetId;
    if (typeof assetId === 'string' && assetId.length > 0) return assetId;
  }
  return null;
}

/** djb2 — a stable seed so a story keeps its colour across sessions and devices. */
export function fallbackColorForSeed(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export function buildShowcaseStory(
  metadata: StoryMetadata,
  scenes: SceneRecord[],
  progress: ShowcaseProgressInput,
): ShowcaseStory {
  const safeScenes = Array.isArray(scenes) ? scenes.filter(isRecord) as SceneRecord[] : [];
  const terminals = new Set(terminalSceneIds(safeScenes));
  const endingsSeen = new Set(
    (progress.endingsReached ?? []).filter((sceneId) => terminals.has(sceneId)),
  ).size;
  const latestSave = progress.latestSave;

  return {
    id: metadata.id,
    title: metadata.title,
    author: metadata.author?.trim() || null,
    coverUri: metadata.thumbnailUri || null,
    teaser: extractTeaser(safeScenes, metadata.startSceneId),
    tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag) => typeof tag === 'string') : [],
    readMinutes: estimateReadMinutes(safeScenes),
    endingsTotal: countEndings(safeScenes),
    endingsSeen,
    branchCount: countBranches(safeScenes),
    bannerEffect: pickBannerEffect(safeScenes, metadata.startSceneId),
    bannerBackgroundAssetId: firstBackgroundAssetId(safeScenes, metadata.startSceneId),
    hasStarted: latestSave !== null,
    isFinished: endingsSeen > 0,
    lastSaveTimestamp: latestSave?.timestamp ?? null,
    lastSceneId: latestSave?.sceneId ?? null,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
  };
}

/**
 * Shelves are mutually exclusive by design: one story on four shelves reads as
 * padding, not as a library. `all` is the only shelf that repeats a card, and a
 * themed shelf below MIN_SHELF_SIZE collapses rather than showing a lone poster.
 */
export function buildShelves(stories: ShowcaseStory[], now: number): ShowcaseShelves {
  const byTimestamp = (a: number | null, b: number | null) => (b ?? 0) - (a ?? 0);

  const continueReading = stories
    .filter((story) => story.hasStarted && !story.isFinished)
    .sort((a, b) => byTimestamp(a.lastSaveTimestamp, b.lastSaveTimestamp));

  const claimed = new Set(continueReading.map((story) => story.id));
  const claim = (story: ShowcaseStory) => {
    if (claimed.has(story.id)) return false;
    claimed.add(story.id);
    return true;
  };

  const unexplored = stories
    .filter((story) => story.isFinished && story.endingsSeen < story.endingsTotal)
    .filter(claim);
  const quickReads = stories
    .filter((story) => story.readMinutes <= QUICK_READ_MAX_MINUTES && !story.hasStarted)
    .filter(claim);
  const fresh = stories
    .filter((story) => now - story.createdAt <= FRESH_WINDOW_MS)
    .filter(claim);

  const all = [...stories].sort((a, b) => b.updatedAt - a.updatedAt);
  const newest = [...stories].sort((a, b) => b.createdAt - a.createdAt);
  const hero = continueReading[0] ?? newest[0] ?? null;
  const shelf = (items: ShowcaseStory[]) => (items.length >= MIN_SHELF_SIZE ? items : []);

  return {
    hero,
    continueReading: shelf(continueReading),
    quickReads: shelf(quickReads),
    fresh: shelf(fresh),
    unexplored: shelf(unexplored),
    all,
  };
}
