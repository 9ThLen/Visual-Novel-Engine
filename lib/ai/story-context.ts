import type { TimelineStep } from '@/lib/engine/types';
import type { StoryReaderTheme } from '@/lib/story-theme';
import type { AppState } from '@/stores/app-store-types';
import { useAppStore } from '@/stores/use-app-store';
import { computeAppearanceRevision } from './appearance-patch';
import { computeSceneRevision } from './scene-revision';

export interface StorySummary { id: string; title: string; sceneCount: number; characterNames: string[]; variableNames: string[]; tags: string[] }
export interface SceneSummary { id: string; name: string; description: string; blockCount: number; connections: Array<{ outputPort: string; targetSceneId: string }>; isStart: boolean }
export interface AiSceneView extends SceneSummary { revision: string; timeline: TimelineStep[] }
/** Current reader theme plus its own revision, so an appearance patch can be guarded independently of scene edits. */
export interface AiAppearanceView { theme: StoryReaderTheme; revision: string }
export interface AiStoryContext { story: StorySummary; activeScene: AiSceneView | null; nearbyScenes: SceneSummary[]; appearance: AiAppearanceView }

export type AiStoryContextSnapshot = Pick<AppState, 'storiesMetadata' | 'sceneRecordsByStory' | 'characterLibraries'>;

function summarizeScene(scene: AppState['sceneRecordsByStory'][string][string]): SceneSummary {
  return {
    id: scene.id,
    name: scene.name,
    description: scene.description,
    blockCount: scene.timeline.length,
    connections: scene.connections.map(({ outputPort, targetSceneId }) => ({ outputPort, targetSceneId })),
    isStart: scene.isStart,
  };
}

export function buildAiStoryContextFromSnapshot(
  snapshot: AiStoryContextSnapshot,
  storyId: string,
  activeSceneId: string | null,
): AiStoryContext | null {
  const metadata = snapshot.storiesMetadata.find((story) => story.id === storyId);
  if (!metadata) return null;
  const scenes = Object.values(snapshot.sceneRecordsByStory[storyId] ?? {});
  const active = activeSceneId ? scenes.find((scene) => scene.id === activeSceneId) ?? null : null;
  const nearbyIds = new Set(active?.connections.map((connection) => connection.targetSceneId) ?? []);
  const variableNames = Array.from(new Set(scenes.flatMap((scene) => Object.keys(scene.sceneState.variables))));

  return {
    story: {
      id: metadata.id,
      title: metadata.title,
      sceneCount: scenes.length,
      characterNames: (snapshot.characterLibraries[storyId] ?? []).map((character) => character.name),
      variableNames,
      tags: metadata.tags ?? [],
    },
    activeScene: active ? { ...summarizeScene(active), revision: computeSceneRevision(active), timeline: active.timeline } : null,
    nearbyScenes: scenes.filter((scene) => nearbyIds.has(scene.id)).map(summarizeScene),
    appearance: { theme: metadata.theme ?? {}, revision: computeAppearanceRevision(metadata) },
  };
}

export function buildAiStoryContext(storyId: string, activeSceneId: string | null): AiStoryContext | null {
  return buildAiStoryContextFromSnapshot(useAppStore.getState(), storyId, activeSceneId);
}
