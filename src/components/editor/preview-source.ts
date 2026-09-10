import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

export function resolvePreviewTimelineFromRecords(
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>,
  storyId: string,
  sceneId: string,
): TimelineStep[] {
  return sceneRecordsByStory[storyId]?.[sceneId]?.timeline ?? [];
}
