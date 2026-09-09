import { buildAiStoryContextFromSnapshot } from '@/lib/ai/story-context';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import type { SceneRecord } from '@/lib/engine/types';

function scene(id: string, target?: string): SceneRecord {
  return { id, storyId: 'story-1', name: id, description: `About ${id}`, tags: [], timeline: [{ id: `step-${id}`, blockType: 'text', data: { content: id, typewriterSpeed: 1, anchorTo: 'background' }, collapsed: false, enabled: true }], sceneState: { backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: { score: 0 }, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null }, flowX: 0, flowY: 0, connections: target ? [{ outputPort: 'next', targetSceneId: target }] : [], isStart: id === 'scene-1', createdAt: 1, updatedAt: 1 };
}

it('builds a one-hop story DTO with timeline only on the active scene', () => {
  const active = scene('scene-1', 'scene-2');
  const nearby = scene('scene-2', 'scene-3');
  const context = buildAiStoryContextFromSnapshot({
    storiesMetadata: [{ id: 'story-1', title: 'Story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 3, tags: ['demo'] }],
    sceneRecordsByStory: { 'story-1': { 'scene-1': active, 'scene-2': nearby, 'scene-3': scene('scene-3') } },
    characterLibraries: { 'story-1': [{ id: 'char-1', name: 'Alice', sprites: [], createdAt: 1 }] },
  }, 'story-1', 'scene-1');

  expect(context?.activeScene?.timeline).toEqual(active.timeline);
  expect(context?.activeScene?.revision).toBe(computeSceneRevision(active));
  expect(context?.nearbyScenes.map((item) => item.id)).toEqual(['scene-2']);
  expect(context?.nearbyScenes[0]).not.toHaveProperty('timeline');
  expect(context?.story).toMatchObject({ sceneCount: 3, characterNames: ['Alice'], variableNames: ['score'], tags: ['demo'] });
});
