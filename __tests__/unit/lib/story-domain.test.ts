import { StoryDomain } from '@/lib/story-domain';
import type { Story, StoryScene } from '@/lib/scene-operations';
import type { PlaybackState } from '@/lib/engine/types';

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'story-1',
    title: 'Test Story',
    description: 'A test story',
    author: 'Tester',
    startSceneId: 'scene-1',
    scenes: {
      'scene-1': {
        id: 'scene-1',
        text: 'Hello world',
        characters: [],
        choices: [],
        musicUri: null,
      },
      'scene-2': {
        id: 'scene-2',
        text: 'Second scene',
        characters: [],
        choices: [],
        musicUri: null,
      },
      'scene-3': {
        id: 'scene-3',
        text: 'Third scene',
        characters: [],
        choices: [],
        musicUri: null,
      },
    },
    audioLibrary: [{ id: 'bgm-1', name: 'BGM', uri: 'music.mp3', type: 'music', createdAt: 100 }],
    createdAt: 100,
    updatedAt: 200,
    thumbnailUri: 'thumb.jpg',
    ...overrides,
  };
}

function makePlaybackState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    storyId: 'story-1',
    currentSceneId: 'scene-1',
    isPlaying: false,
    currentDialogueIndex: 0,
    choicesMade: [],
    ...overrides,
  };
}

function makeStoryScene(overrides: Partial<StoryScene> = {}): StoryScene {
  return {
    id: 'scene-1',
    text: 'Hello world',
    backgroundImageUri: 'bg.jpg',
    characters: [],
    voiceAudioUri: null,
    choices: [],
    musicUri: null,
    ...overrides,
  };
}

describe('StoryDomain.extractMetadata', () => {
  it('extracts metadata from a full story', () => {
    const story = makeStory();
    const metadata = StoryDomain.extractMetadata(story);

    expect(metadata.id).toBe('story-1');
    expect(metadata.title).toBe('Test Story');
    expect(metadata.sceneCount).toBe(3);
    expect(metadata.startSceneId).toBe('scene-1');
    expect(metadata.createdAt).toBe(100);
    expect(metadata.updatedAt).toBe(200);
  });

  it('computes sceneCount = 0 for empty scenes', () => {
    const story = makeStory({ scenes: {} });
    const metadata = StoryDomain.extractMetadata(story);

    expect(metadata.sceneCount).toBe(0);
  });

  it('strips scenes and audioLibrary from output', () => {
    const story = makeStory();
    const metadata = StoryDomain.extractMetadata(story);

    expect((metadata as any).scenes).toBeUndefined();
    expect((metadata as any).audioLibrary).toBeUndefined();
  });

  it('preserves optional fields in metadata', () => {
    const story = makeStory({ description: 'Custom desc', author: 'Author', thumbnailUri: 'custom.jpg' });
    const metadata = StoryDomain.extractMetadata(story);

    expect(metadata.description).toBe('Custom desc');
    expect(metadata.author).toBe('Author');
    expect(metadata.thumbnailUri).toBe('custom.jpg');
  });

  it('handles undefined scenes gracefully', () => {
    const story = makeStory({ scenes: undefined as any });
    const metadata = StoryDomain.extractMetadata(story);

    expect(metadata.sceneCount).toBe(0);
  });
});

describe('StoryDomain.createSaveSlot', () => {
  it('creates save slot with all fields populated', () => {
    const story = makeStory();
    const playbackState = makePlaybackState({ currentSceneId: 'scene-2', choicesMade: [{ sceneId: 'scene-1', choiceId: 'opt-1' }] });
    const currentScene = makeStoryScene({ id: 'scene-2', text: 'Choice time', backgroundImageUri: 'bg2.jpg' });

    const slot = StoryDomain.createSaveSlot('slot-1', story, playbackState, currentScene);

    expect(slot.id).toBe('slot-1');
    expect(slot.storyId).toBe('story-1');
    expect(slot.sceneId).toBe('scene-2');
    expect(slot.choicesMade).toEqual([{ sceneId: 'scene-1', choiceId: 'opt-1' }]);
    expect(slot.storyTitle).toBe('Test Story');
    expect(slot.thumbnailUri).toBe('bg2.jpg');
    expect(slot.sceneText).toBe('Choice time');
    expect(slot.timestamp).toBeGreaterThan(0);
  });

  it('uses playbackState.currentSceneId as sceneId', () => {
    const story = makeStory();
    const playbackState = makePlaybackState({ currentSceneId: 'scene-3' });

    const slot = StoryDomain.createSaveSlot('slot-2', story, playbackState);

    expect(slot.sceneId).toBe('scene-3');
  });

  it('copies choicesMade from playbackState', () => {
    const choicesMade = [
      { sceneId: 'scene-1', choiceId: 'opt-a' },
      { sceneId: 'scene-2', choiceId: 'opt-b' },
    ];
    const story = makeStory();
    const playbackState = makePlaybackState({ choicesMade });

    const slot = StoryDomain.createSaveSlot('slot-3', story, playbackState);

    expect(slot.choicesMade).toEqual(choicesMade);
  });

  it('extracts first line of scene text truncated to 100 characters', () => {
    const longText = 'A'.repeat(150) + '\nSecond line';
    const story = makeStory();
    const playbackState = makePlaybackState();
    const currentScene = makeStoryScene({ text: longText });

    const slot = StoryDomain.createSaveSlot('slot-4', story, playbackState, currentScene);

    expect(slot.sceneText).toBe('A'.repeat(100));
    expect(slot.sceneText?.length).toBe(100);
  });

  it('handles missing currentScene', () => {
    const story = makeStory();
    const playbackState = makePlaybackState();

    const slot = StoryDomain.createSaveSlot('slot-5', story, playbackState, undefined);

    expect(slot.sceneText).toBe('');
    expect(slot.sceneName).toBeUndefined();
    expect(slot.sceneId).toBe('scene-1');
  });

  it('handles currentScene with null text', () => {
    const story = makeStory();
    const playbackState = makePlaybackState();
    const currentScene = makeStoryScene({ text: null as any });

    const slot = StoryDomain.createSaveSlot('slot-6', story, playbackState, currentScene);

    expect(slot.sceneText).toBe('');
  });

  it('includes storyTitle from story', () => {
    const story = makeStory({ title: 'My Awesome Story' });
    const playbackState = makePlaybackState();

    const slot = StoryDomain.createSaveSlot('slot-7', story, playbackState);

    expect(slot.storyTitle).toBe('My Awesome Story');
  });
});
