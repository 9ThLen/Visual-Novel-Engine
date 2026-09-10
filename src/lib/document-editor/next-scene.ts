import { createEmptySceneState } from '@/lib/engine/conditionUtils';
import type { SceneRecord } from '@/lib/engine/types';
import { generateId } from '@/lib/id-utils';

export function insertSceneAfter(sceneIds: string[], sourceSceneId: string, nextSceneId: string): string[] {
  const withoutNext = sceneIds.filter((sceneId) => sceneId !== nextSceneId);
  const sourceIndex = withoutNext.indexOf(sourceSceneId);
  if (sourceIndex < 0) return [...withoutNext, nextSceneId];
  return [
    ...withoutNext.slice(0, sourceIndex + 1),
    nextSceneId,
    ...withoutNext.slice(sourceIndex + 1),
  ];
}

export function connectSourceToNext(
  records: SceneRecord[],
  sourceSceneId: string,
  nextSceneId: string,
): SceneRecord[] {
  return records.map((record) => {
    if (record.id !== sourceSceneId) return record;
    return {
      ...record,
      connections: [
        ...(record.connections || []).filter((connection) => connection.outputPort !== 'next'),
        { targetSceneId: nextSceneId, outputPort: 'next', label: 'Next' },
      ],
      updatedAt: Date.now(),
    };
  });
}

export function createNextSceneRecordAfter(source: SceneRecord, scenes: SceneRecord[]): SceneRecord {
  const now = Date.now();
  const sceneNumber = scenes.length + 1;
  return {
    id: generateId('scene'),
    storyId: source.storyId,
    name: `Scene ${sceneNumber}`,
    description: '',
    tags: [],
    timeline: [],
    sceneState: createEmptySceneState(),
    flowX: source.flowX + 360,
    flowY: source.flowY,
    connections: [],
    isStart: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateSceneRecord(source: SceneRecord, duplicateName: string): SceneRecord {
  const now = Date.now();
  return {
    ...source,
    id: generateId('scene'),
    name: duplicateName,
    timeline: JSON.parse(JSON.stringify(source.timeline)),
    sceneState: JSON.parse(JSON.stringify(source.sceneState)),
    connections: JSON.parse(JSON.stringify(source.connections || [])),
    isStart: false,
    flowX: source.flowX + 36,
    flowY: source.flowY + 36,
    createdAt: now,
    updatedAt: now,
  };
}
