import type { SceneRecord } from '@/lib/engine/types';

export function buildDocumentsResetKey(activeSceneId: string, scenes: Pick<SceneRecord, 'id' | 'updatedAt'>[]): string {
  return [
    activeSceneId,
    ...scenes.map((scene) => `${scene.id}:${scene.updatedAt}`),
  ].join('|');
}
