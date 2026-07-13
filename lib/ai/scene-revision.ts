import type { SceneRecord } from '@/lib/engine/types';

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
}

export function computeSceneRevision(scene: SceneRecord): string {
  const content = { name: scene.name, description: scene.description, tags: scene.tags, timeline: scene.timeline, connections: scene.connections, isStart: scene.isStart, sceneState: scene.sceneState };
  let hash = 0x811c9dc5;
  for (const char of stableStringify(content)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
