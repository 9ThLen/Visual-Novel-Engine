import type { MusicBlockData, SceneRecord, SoundBlockData, TimelineStep } from '@/lib/engine/types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object';
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function assetIdValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function secondsFromMs(value: unknown, fallbackMs: number): number {
  return Math.max(0, numberValue(value, fallbackMs) / 1000);
}

function audioMode(value: unknown): 'track' | 'silence' | null {
  return value === 'track' || value === 'silence' ? value : null;
}

function audioBinding(value: unknown, fallback: 'scene' | 'continuous'): 'scene' | 'continuous' {
  return value === 'scene' || value === 'continuous' ? value : fallback;
}

function optionalSeconds(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function migrateMusicBlockData(data: unknown): MusicBlockData {
  if (isRecord(data) && audioMode(data.mode)) {
    return data as unknown as MusicBlockData;
  }

  const legacy = isRecord(data) ? data : {};
  const action = typeof legacy.action === 'string' ? legacy.action : 'play';
  const isTrack = action === 'play';

  if (isTrack) {
    return {
      mode: 'track',
      assetId: assetIdValue(legacy.assetId),
      volume: Math.max(0, Math.min(1, numberValue(legacy.volume, 0.8))),
      loop: booleanValue(legacy.loop, true),
      fadeIn: secondsFromMs(legacy.fadeDuration, 1000),
      fadeOut: 0.8,
      boundTo: 'continuous',
      autoFadeAfter: optionalSeconds(legacy.autoFadeAfter),
    };
  }

  return {
    mode: 'silence',
    assetId: assetIdValue(legacy.assetId),
    volume: Math.max(0, Math.min(1, numberValue(legacy.volume, 0.8))),
    loop: booleanValue(legacy.loop, true),
    fadeIn: 0,
    fadeOut: secondsFromMs(legacy.fadeDuration, 800),
    boundTo: 'continuous',
  };
}

export function migrateSoundBlockData(data: unknown): SoundBlockData {
  if (isRecord(data) && audioMode(data.mode)) {
    return data as unknown as SoundBlockData;
  }

  const legacy = isRecord(data) ? data : {};
  const action = legacy.action === 'stop' ? 'stop' : 'play';

  return {
    mode: action === 'stop' ? 'silence' : 'track',
    assetId: assetIdValue(legacy.assetId),
    volume: Math.max(0, Math.min(1, numberValue(legacy.volume, 0.8))),
    loop: action === 'stop' ? true : booleanValue(legacy.loop, false),
    fadeIn: 0,
    fadeOut: action === 'stop' ? secondsFromMs(legacy.fadeDuration, 0) : 0,
    pitchVariation: Math.max(0, Math.min(1, numberValue(legacy.pitchVariation, 0))),
    boundTo: audioBinding(legacy.boundTo, 'continuous'),
  };
}

export function migrateSceneRecordTimeline(timeline: TimelineStep[] | undefined | null): TimelineStep[] {
  if (!Array.isArray(timeline)) return [];

  return timeline.map((step) => {
    if (step.blockType === 'music') {
      return { ...step, data: migrateMusicBlockData(step.data) };
    }
    if (step.blockType === 'sound') {
      return { ...step, data: migrateSoundBlockData(step.data) };
    }
    return step;
  });
}

export function migrateSceneRecord(scene: SceneRecord): SceneRecord {
  return {
    ...scene,
    timeline: migrateSceneRecordTimeline(scene.timeline),
  };
}

export function migrateSceneRecordMap(
  scenes: Record<string, SceneRecord> | undefined | null,
): Record<string, SceneRecord> {
  if (!scenes) return {};
  return Object.fromEntries(
    Object.entries(scenes).map(([sceneId, scene]) => [sceneId, migrateSceneRecord(scene)]),
  );
}

export function migrateSceneRecordsByStory(
  scenes: Record<string, Record<string, SceneRecord>> | undefined | null,
): Record<string, Record<string, SceneRecord>> {
  if (!scenes) return {};
  return Object.fromEntries(
    Object.entries(scenes).map(([storyId, storyScenes]) => [
      storyId,
      migrateSceneRecordMap(storyScenes),
    ]),
  );
}
