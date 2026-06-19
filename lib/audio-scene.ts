import type { AudioScene } from '@/lib/audio-types';
import type { MusicBlockData, SceneRecord } from '@/lib/engine/types';

export function toAudioScene(record: SceneRecord): AudioScene {
  return {
    id: record.id,
    storyId: record.storyId,
    name: record.name,
    timeline: record.timeline,
  };
}

export function getAudioSceneMusicUri(scene: AudioScene): string | null {
  const musicStep = scene.timeline.find((step) => step.enabled && step.blockType === 'music');
  if (!musicStep) return null;
  const data = musicStep.data as MusicBlockData;
  return data.action === 'play' ? data.assetId ?? null : null;
}
