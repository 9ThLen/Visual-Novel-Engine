/**
 * lib/editor/story-library.ts — pure domain for the studio's project shelf.
 *
 * Turns persisted stories into the shape `/editor` renders: authored size, one
 * honest status, where to resume, and how long ago the author was last here.
 * No zustand, no react — everything is a function of its arguments, so the
 * screen stays dumb and this file stays testable. Same split as
 * `lib/showcase/story-showcase.ts`, which does the reader's half of the job.
 */

import { validateSceneGraph } from '@/lib/document-editor/scene-graph-validator';
import type { SceneRecord } from '@/lib/engine/types';
import { computeStoryStats } from '@/lib/story-stats';
import type { StoryMetadata } from '@/lib/story-domain';

/**
 * `pending` is not a state of the story — it means this story's scenes are not
 * fully in memory yet, so any graph verdict would be a guess. A window-hydrated
 * story is missing scenes, and missing scenes look exactly like broken links.
 */
export type StudioProjectStatus = 'pending' | 'issues' | 'draft' | 'ready';

export type StudioSort = 'recent' | 'title' | 'size';

export interface StudioProject {
  id: string;
  title: string;
  author: string | null;
  coverUri: string | null;
  tags: string[];
  /** From metadata, so it is right even before the scenes are hydrated. */
  scenes: number;
  /** Null until the scene graph is fully hydrated. */
  words: number | null;
  choices: number | null;
  status: StudioProjectStatus;
  /** How many graph issues the status is counting; 0 unless `status` is `issues`. */
  issueCount: number;
  /** The scene «Continue» opens: the last one edited, or the start scene. */
  resumeSceneId: string;
  /** Where a preview begins — always the story's own entry point. */
  startSceneId: string;
  createdAt: number;
  updatedAt: number;
}

export interface StudioLibraryInput {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  sceneRecordHydration: Record<string, 'full' | 'window'>;
  lastEditedSceneByStory: Record<string, string>;
}

function scenesOf(
  input: StudioLibraryInput,
  storyId: string,
): SceneRecord[] {
  return Object.values(input.sceneRecordsByStory[storyId] ?? {});
}

/**
 * The scene «Continue» should open. The remembered scene can outlive the scene
 * itself (deleted, or the story re-imported), so it is only honoured while the
 * story's own records still contain it.
 */
export function resolveResumeSceneId(
  story: StoryMetadata,
  scenes: SceneRecord[],
  lastEditedSceneId: string | undefined,
): string {
  if (lastEditedSceneId && scenes.some((scene) => scene.id === lastEditedSceneId)) {
    return lastEditedSceneId;
  }
  return story.startSceneId;
}

export function buildStudioProject(
  story: StoryMetadata,
  scenes: SceneRecord[],
  options: { hydrated: boolean; lastEditedSceneId?: string },
): StudioProject {
  const base = {
    id: story.id,
    title: story.title,
    author: story.author?.trim() || null,
    coverUri: story.thumbnailUri ?? null,
    tags: story.tags ?? [],
    resumeSceneId: resolveResumeSceneId(story, scenes, options.lastEditedSceneId),
    startSceneId: story.startSceneId,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  };

  if (!options.hydrated) {
    return {
      ...base,
      scenes: story.sceneCount ?? scenes.length,
      words: null,
      choices: null,
      status: 'pending',
      issueCount: 0,
    };
  }

  const stats = computeStoryStats(scenes);
  const issues = validateSceneGraph(scenes);
  // Cover and description are what stands between a working graph and something
  // a reader can be shown — the same two checks the story page calls readiness.
  const presentable = Boolean(story.thumbnailUri) && Boolean(story.description?.trim());

  return {
    ...base,
    scenes: stats.scenes,
    words: stats.words,
    choices: stats.choices,
    status: issues.length > 0 ? 'issues' : presentable ? 'ready' : 'draft',
    issueCount: issues.length,
  };
}

export function buildStudioProjects(input: StudioLibraryInput): StudioProject[] {
  return input.storiesMetadata.map((story) =>
    buildStudioProject(story, scenesOf(input, story.id), {
      hydrated: input.sceneRecordHydration[story.id] === 'full',
      lastEditedSceneId: input.lastEditedSceneByStory[story.id],
    }),
  );
}

export function summarizeStudioLibrary(projects: StudioProject[]): {
  stories: number;
  scenes: number;
} {
  return {
    stories: projects.length,
    scenes: projects.reduce((sum, project) => sum + project.scenes, 0),
  };
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function sortStudioProjects(projects: StudioProject[], sort: StudioSort): StudioProject[] {
  const sorted = [...projects];
  if (sort === 'title') {
    sorted.sort((a, b) => collator.compare(a.title, b.title));
  } else if (sort === 'size') {
    // Words is the honest measure of a manuscript, but it is null until the
    // scenes land; scene count keeps the order stable in the meantime.
    sorted.sort((a, b) => (b.words ?? 0) - (a.words ?? 0) || b.scenes - a.scenes);
  } else {
    sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return sorted;
}

export function filterStudioProjects(projects: StudioProject[], query: string): StudioProject[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return projects;
  return projects.filter((project) => {
    if (project.title.toLowerCase().includes(needle)) return true;
    if (project.author?.toLowerCase().includes(needle)) return true;
    return project.tags.some((tag) => tag.toLowerCase().includes(needle));
  });
}

/** Wide card threshold: after a week away, no project is «what you were doing». */
export const FEATURED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether the first card renders wide. Only under the default order — under any
 * other sort the first row is an alphabet or a size, not a place to resume.
 */
export function shouldFeatureFirst(
  projects: StudioProject[],
  sort: StudioSort,
  now: number,
): boolean {
  if (sort !== 'recent' || projects.length < 2) return false;
  return now - projects[0].updatedAt < FEATURED_MAX_AGE_MS;
}

/** Below this, a search field and a sort control are noise. */
export const TOOLBAR_MIN_PROJECTS = 4;

export type RelativeTime =
  | { unit: 'justNow' }
  | { unit: 'minutes'; count: number }
  | { unit: 'hours'; count: number }
  | { unit: 'yesterday' }
  | { unit: 'days'; count: number }
  | { unit: 'date' };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Returns a descriptor rather than a string: the words are the screen's job
 * (i18n) and the date format is the platform's, but the thresholds are domain.
 */
export function describeUpdatedAt(updatedAt: number, now: number): RelativeTime {
  const elapsed = now - updatedAt;
  if (elapsed < MINUTE) return { unit: 'justNow' };
  if (elapsed < HOUR) return { unit: 'minutes', count: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { unit: 'hours', count: Math.floor(elapsed / HOUR) };
  if (elapsed < 2 * DAY) return { unit: 'yesterday' };
  if (elapsed < 7 * DAY) return { unit: 'days', count: Math.floor(elapsed / DAY) };
  return { unit: 'date' };
}
