/**
 * lib/showcase/showcase-adapter.ts — the seam between the store and the
 * showcase domain. Everything here is a function of the data it is handed, so
 * the domain stays testable without zustand and the screens stay dumb.
 */

import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import {
  buildShowcaseStory,
  type ShowcaseProgressInput,
  type ShowcaseStory,
} from '@/lib/showcase/story-showcase';

export interface ShowcaseSaveSlot {
  storyId: string;
  sceneId: string;
  timestamp: number;
}

export interface ShowcaseSource {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  saveSlots: ShowcaseSaveSlot[];
  /** Added by the finale tracking step; absent on stores that predate it. */
  endingsReachedByStory?: Record<string, string[]>;
}

export function scenesForStory(
  sceneRecordsByStory: ShowcaseSource['sceneRecordsByStory'],
  storyId: string,
): SceneRecord[] {
  return Object.values(sceneRecordsByStory?.[storyId] ?? {});
}

/**
 * The newest save of any kind. Quick and auto slots count: the reader's real
 * position is wherever they last were, not wherever they last pressed Save.
 */
export function latestSaveForStory(
  saveSlots: ShowcaseSaveSlot[],
  storyId: string,
): ShowcaseProgressInput['latestSave'] {
  let latest: ShowcaseProgressInput['latestSave'] = null;

  for (const slot of saveSlots ?? []) {
    if (slot?.storyId !== storyId) continue;
    if (latest && slot.timestamp <= latest.timestamp) continue;
    latest = { sceneId: slot.sceneId, timestamp: slot.timestamp };
  }

  return latest;
}

export function progressForStory(source: ShowcaseSource, storyId: string): ShowcaseProgressInput {
  return {
    latestSave: latestSaveForStory(source.saveSlots ?? [], storyId),
    endingsReached: source.endingsReachedByStory?.[storyId] ?? [],
  };
}

export function buildShowcaseStories(source: ShowcaseSource): ShowcaseStory[] {
  return (source.storiesMetadata ?? []).map((metadata) =>
    buildShowcaseStory(
      metadata,
      scenesForStory(source.sceneRecordsByStory ?? {}, metadata.id),
      progressForStory(source, metadata.id),
    ),
  );
}

/**
 * Which asset a story shows. The author's cover comes first, but thumbnailUri is
 * optional and usually unset, so the story's own opening background stands in
 * before we fall back to a flat colour. The value is an asset *reference* —
 * a library id, a bundled path or a media uri — for asset-resolver to resolve.
 */
export function posterAssetFor(story: ShowcaseStory): string | null {
  return story.coverUri ?? story.bannerBackgroundAssetId;
}

/**
 * A scene's name, or null when it hasn't got one worth showing. Imported and
 * legacy stories fall back to naming a scene after its own id, and
 * "from: scene_1" tells a reader nothing — better to show no line at all.
 */
export function sceneNameFor(scenes: SceneRecord[], sceneId: string | null): string | null {
  if (!sceneId) return null;
  const scene = scenes.find((candidate) => candidate?.id === sceneId);
  const name = scene?.name?.trim();
  if (!name || name === scene?.id) return null;
  return name;
}
