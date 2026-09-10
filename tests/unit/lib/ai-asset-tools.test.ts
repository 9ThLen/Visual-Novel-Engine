import {
  findAssetUsageFromSnapshot,
  getImageDetailsFromSnapshot,
  listStoryImagesFromSnapshot,
  type AiAssetToolsSnapshot,
} from '@/lib/ai/asset-tools';
import type { BackgroundBlockData, SceneRecord, TimelineStep } from '@/lib/engine/types';

function backgroundStep(id: string, assetId: string): TimelineStep {
  const data: BackgroundBlockData = { assetId, transition: 'fade', duration: 1 };
  return { id, blockType: 'background', data, collapsed: false, enabled: true };
}

function scene(id: string, name: string, timeline: TimelineStep[]): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name,
    description: '',
    tags: [],
    timeline,
    sceneState: {
      backgroundAssetId: null,
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      musicTrackId: null,
      musicPlaying: false,
      musicVolume: 1,
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function snapshot(): AiAssetToolsSnapshot {
  return {
    sceneRecordsByStory: {
      'story-1': {
        'scene-1': scene('scene-1', 'Forest', [backgroundStep('step-1', 'img-forest')]),
        // Older content can reference an image by uri rather than id.
        'scene-2': scene('scene-2', 'Cave', [backgroundStep('step-2', 'file:///cave.png')]),
      },
    },
    mediaLibrary: [
      { id: 'img-forest', type: 'image', uri: 'file:///forest.png', name: 'Forest', addedAt: 1 },
      { id: 'img-cave', type: 'image', uri: 'file:///cave.png', name: 'Cave', addedAt: 2 },
      { id: 'img-unused', type: 'image', uri: 'data:image/png;base64,AAAA', name: 'Unused', addedAt: 3 },
      { id: 'snd-1', type: 'audio', uri: 'file:///music.mp3', name: 'Music', addedAt: 4 },
    ],
    imageAssetIdsByStory: { 'story-1': ['img-forest', 'img-cave', 'img-unused'] },
  };
}

describe('listStoryImages', () => {
  it('returns story images with usage counts and never leaks the uri', () => {
    const images = listStoryImagesFromSnapshot(snapshot(), 'story-1');

    expect(images).toEqual([
      { id: 'img-forest', name: 'Forest', uriKind: 'file', usageCount: 1 },
      { id: 'img-cave', name: 'Cave', uriKind: 'file', usageCount: 1 },
      { id: 'img-unused', name: 'Unused', uriKind: 'data', usageCount: 0 },
    ]);
    expect(JSON.stringify(images)).not.toContain('file:///');
    expect(JSON.stringify(images)).not.toContain('base64');
  });

  it('excludes audio and images belonging to other stories', () => {
    const ids = listStoryImagesFromSnapshot(snapshot(), 'story-1').map((image) => image.id);
    expect(ids).not.toContain('snd-1');
    expect(listStoryImagesFromSnapshot(snapshot(), 'story-missing')).toEqual([]);
  });
});

describe('getImageDetails', () => {
  it('resolves a uri-based reference back to the owning asset', () => {
    const details = getImageDetailsFromSnapshot(snapshot(), 'story-1', 'img-cave');

    expect(details).toMatchObject({ id: 'img-cave', name: 'Cave', usageCount: 1 });
    expect(details?.usedIn).toEqual([
      { sceneId: 'scene-2', sceneName: 'Cave', stepId: 'step-2', kind: 'background', enabled: true },
    ]);
  });

  it('returns null for an asset outside the story', () => {
    expect(getImageDetailsFromSnapshot(snapshot(), 'story-1', 'snd-1')).toBeNull();
  });
});

describe('findAssetUsage', () => {
  it('names the scenes an asset is used in', () => {
    expect(findAssetUsageFromSnapshot(snapshot(), 'story-1', 'img-forest')).toEqual([
      { sceneId: 'scene-1', sceneName: 'Forest', stepId: 'step-1', kind: 'background', enabled: true },
    ]);
  });

  it('distinguishes an unused asset from an unknown one', () => {
    expect(findAssetUsageFromSnapshot(snapshot(), 'story-1', 'img-unused')).toEqual([]);
    expect(findAssetUsageFromSnapshot(snapshot(), 'story-1', 'nope')).toBeNull();
  });
});
