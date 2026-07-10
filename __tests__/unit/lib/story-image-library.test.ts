import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import {
  addImageAssetToStory,
  getStoryImageAssets,
  migrateStoryImageAssetIds,
  removeImageAssetFromStory,
} from '@/lib/story-image-library';

const images: LibraryAsset[] = [
  { id: 'image-a', type: 'image', name: 'a.png', uri: 'file:///a.png', addedAt: 1 },
  { id: 'image-b', type: 'image', name: 'b.png', uri: 'file:///b.png', addedAt: 2 },
  { id: 'audio-a', type: 'audio', name: 'a.mp3', uri: 'file:///a.mp3', addedAt: 3 },
];

function sceneWithBackground(assetId: string): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-a',
    name: 'Scene',
    description: '',
    tags: [],
    timeline: [{
      id: 'step-1',
      blockType: 'background',
      data: { assetId, transition: 'fade', duration: 500 },
      collapsed: false,
      enabled: true,
    }],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('story-image-library', () => {
  it('shows only images explicitly attached to the active story', () => {
    const imageAssetIdsByStory = {
      'story-a': ['image-a', 'audio-a'],
      'story-b': ['image-b'],
    };

    expect(getStoryImageAssets('story-a', imageAssetIdsByStory, images).map((asset) => asset.id))
      .toEqual(['image-a']);
    expect(getStoryImageAssets('story-b', imageAssetIdsByStory, images).map((asset) => asset.id))
      .toEqual(['image-b']);
  });

  it('adds and removes memberships without changing another story', () => {
    const withImage = addImageAssetToStory({}, 'story-a', 'image-a');
    const withDuplicate = addImageAssetToStory(withImage, 'story-a', 'image-a');
    const withSecondStory = addImageAssetToStory(withDuplicate, 'story-b', 'image-a');

    expect(withSecondStory).toEqual({ 'story-a': ['image-a'], 'story-b': ['image-a'] });
    expect(removeImageAssetFromStory(withSecondStory, 'story-a', 'image-a'))
      .toEqual({ 'story-a': [], 'story-b': ['image-a'] });
  });

  it('migrates only images already referenced by each story', () => {
    const migrated = migrateStoryImageAssetIds(
      {},
      {
        'story-a': { 'scene-1': sceneWithBackground('image-a') },
        'story-b': { 'scene-2': sceneWithBackground('file:///b.png') },
      },
      images,
    );

    expect(migrated).toEqual({ 'story-a': ['image-a'], 'story-b': ['image-b'] });
  });

  it('preserves an explicit empty library when migration has already run', () => {
    const migrated = migrateStoryImageAssetIds(
      { 'story-a': [] },
      { 'story-a': { 'scene-1': sceneWithBackground('image-a') } },
      images,
      false,
    );

    expect(migrated).toEqual({ 'story-a': [] });
  });
});
