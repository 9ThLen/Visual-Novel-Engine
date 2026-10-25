/**
 * Whether a scene is read as the novel or as a comic page
 * (docs/plans/COMIC-MODE-PLAN.md, section 2).
 *
 * Three things decide it: the story's reading format, the scene's own setting
 * ("Auto / Always comic / Always novel"), and the reader's choice when the
 * story offers both. Above all three stands what a comic page cannot show yet:
 * a scene that plays a video or holds an interactive object is read as the
 * novel even when it is set to always be a comic, or a video background would
 * be lost and a cutscene the comic cannot finish would hold the reader.
 *
 * Plain TypeScript, no React and no store: the reader decides from the stored
 * scene, the editor from the scene it has open.
 */
import { addressSentences } from '@/lib/comic/comic-anchors';
import { rebindComicSettings, sanitizeComicEdits } from '@/lib/comic/comic-settings';
import type {
  SceneComicSettings,
  ScenePresentation,
  TimelineStep,
  VideoBlockData,
} from '@/lib/engine/types';

/** The story's reading format. A story that names none is a novel. */
export type StoryReadingFormat = 'novel' | 'comic' | 'both';

export type ReadAs = 'novel' | 'comic';

/** What in a scene a comic page cannot show yet. */
export type NovelOnlyReason = 'video' | 'interactive_object';

export interface SceneComicCapabilities {
  /** Why the scene can only be read as the novel, or null when a comic page can show it. */
  novelOnly: NovelOnlyReason | null;
}

export type PresentationReason =
  /** The scene follows the story's reading format. */
  | 'story-format'
  /** The story offers both, and this is what the reader chose. */
  | 'reader-choice'
  /** The scene is set to always be read one way. */
  | 'scene-setting'
  | NovelOnlyReason;

export interface ScenePresentationDecision {
  readAs: ReadAs;
  reason: PresentationReason;
}

function isScenePresentation(value: unknown): value is ScenePresentation {
  return value === 'auto' || value === 'comic' || value === 'novel';
}

/**
 * A scene's comic settings as they may be kept: an unknown presentation is
 * "Auto", and "Auto" is the same as no setting, so neither is kept; the
 * author's edits of its panels are kept as `sanitizeComicEdits` reads them.
 * Settings that come to nothing are no settings.
 */
export function sanitizeSceneComicSettings(value: unknown): SceneComicSettings | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const presentation = isScenePresentation(raw.presentation) && raw.presentation !== 'auto' ? raw.presentation : undefined;
  const settings: SceneComicSettings = { ...(presentation ? { presentation } : {}), ...sanitizeComicEdits(raw) };
  return Object.keys(settings).length ? settings : undefined;
}

/** The scene's own setting, "Auto" when it has none. */
export function scenePresentationOf(comic: SceneComicSettings | undefined): ScenePresentation {
  return sanitizeSceneComicSettings(comic)?.presentation ?? 'auto';
}

/**
 * The record with these comic settings, as they may be kept: settings that
 * come to nothing ("Auto") leave the record with none. A record that already
 * has them comes back as it is.
 */
export function withSceneComicSettings<T extends { comic?: SceneComicSettings }>(record: T, comic: unknown): T {
  const next = sanitizeSceneComicSettings(comic);
  // Settings are built in one order, so the same settings print the same.
  if (JSON.stringify(next) === JSON.stringify(record.comic)) return record;
  const { comic: _previous, ...rest } = record;
  return (next ? { ...rest, comic: next } : rest) as T;
}

/**
 * A record the editor is about to save, with the scene's comic settings as
 * the store has them: every edit whose sentence moved is fastened to where its
 * words are in the record's new timeline, so the next opening finds it in
 * place. Edits whose words changed or whose sentence is gone stay as they are,
 * for Issues to show.
 */
export function withSavedComicSettings<T extends { comic?: SceneComicSettings; timeline: TimelineStep[] }>(record: T, comic: unknown): T {
  return withSceneComicSettings(record, rebindComicSettings(sanitizeSceneComicSettings(comic), addressSentences(record.timeline)));
}

/**
 * What in the scene's timeline keeps it a novel. A step counts when the
 * executor would run it: a switched-off step does not, a step with conditions
 * does, since its conditions may hold.
 */
export function sceneComicCapabilities(timeline: TimelineStep[]): SceneComicCapabilities {
  for (const step of timeline) {
    if (!step.enabled) continue;
    if (step.blockType === 'interactive_object') return { novelOnly: 'interactive_object' };
    // Any layer: a background video would be lost, a cutscene never finished.
    if (step.blockType === 'video' && (step.data as VideoBlockData).mode === 'play') return { novelOnly: 'video' };
  }
  return { novelOnly: null };
}

/**
 * How the scene is read. `format` is the story's (none = novel); `readerChoice`
 * counts only when the story offers both, and until the reader has chosen the
 * scene is read as the novel.
 */
export function resolveScenePresentation(
  format: StoryReadingFormat | undefined,
  readerChoice: ReadAs | null | undefined,
  comic: SceneComicSettings | undefined,
  capabilities: SceneComicCapabilities,
): ScenePresentationDecision {
  if (capabilities.novelOnly) return { readAs: 'novel', reason: capabilities.novelOnly };
  const presentation = sanitizeSceneComicSettings(comic)?.presentation;
  if (presentation && presentation !== 'auto') return { readAs: presentation, reason: 'scene-setting' };
  if (format === 'comic') return { readAs: 'comic', reason: 'story-format' };
  if (format === 'both' && (readerChoice === 'comic' || readerChoice === 'novel')) return { readAs: readerChoice, reason: 'reader-choice' };
  return { readAs: 'novel', reason: 'story-format' };
}
