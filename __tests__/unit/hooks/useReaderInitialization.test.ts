import { renderHook, waitFor } from '@testing-library/react';
import { useReaderInitialization } from '@/hooks/useReaderInitialization';
import { createEmptySceneState } from '@/lib/engine/conditionUtils';
import type { SceneRecord } from '@/lib/engine/types';
import { useAppStore } from '@/stores/use-app-store';

function makeSceneRecord(id: string, storyId = 'story-1'): SceneRecord {
  return {
    id,
    storyId,
    name: id,
    description: '',
    tags: [],
    timeline: [],
    sceneState: createEmptySceneState(),
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: id === 'scene-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

const storyMetadata = {
  id: 'story-1',
  title: 'Story',
  startSceneId: 'scene-1',
  createdAt: 1,
  updatedAt: 1,
  sceneCount: 2,
};

describe('useReaderInitialization', () => {
  afterEach(() => {
    useAppStore.setState({
      storiesMetadata: [],
      sceneRecordsByStory: {},
      currentStoryId: null,
      playbackState: null,
      hydrateReaderSceneWindow: vi.fn(),
      loadCurrentStory: vi.fn(),
      updatePlaybackState: vi.fn(),
    });
  });

  it('hydrates the existing playback scene when resuming reader state', async () => {
    const hydrateReaderSceneWindow = vi.fn(async (storyId: string, sceneId: string) => {
      useAppStore.setState({
        sceneRecordsByStory: {
          [storyId]: {
            [sceneId]: makeSceneRecord(sceneId, storyId),
          },
        },
      });
      return true;
    });
    useAppStore.setState({
      storiesMetadata: [storyMetadata],
      currentStoryId: 'story-1',
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'scene-2',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
      },
      hydrateReaderSceneWindow,
      loadCurrentStory: vi.fn(async (storyId: string | null) => {
        useAppStore.setState({ currentStoryId: storyId });
      }),
      updatePlaybackState: vi.fn((state) => {
        useAppStore.setState({ playbackState: state });
      }),
    });

    renderHook(() => useReaderInitialization('story-1', { resumeExisting: true }));

    await waitFor(() => {
      expect(hydrateReaderSceneWindow).toHaveBeenCalledWith('story-1', 'scene-2');
    });
    expect(useAppStore.getState().playbackState?.currentSceneId).toBe('scene-2');
  });

  it('hydrates the start scene when the reusable playback scene is unavailable', async () => {
    const hydrateReaderSceneWindow = vi.fn(async (storyId: string, sceneId: string) => {
      if (sceneId !== 'scene-1') return false;
      useAppStore.setState({
        sceneRecordsByStory: {
          [storyId]: {
            [sceneId]: makeSceneRecord(sceneId, storyId),
          },
        },
      });
      return true;
    });
    useAppStore.setState({
      storiesMetadata: [storyMetadata],
      currentStoryId: 'story-1',
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'missing-scene',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
      },
      hydrateReaderSceneWindow,
      loadCurrentStory: vi.fn(async (storyId: string | null) => {
        useAppStore.setState({ currentStoryId: storyId });
      }),
      updatePlaybackState: vi.fn((state) => {
        useAppStore.setState({ playbackState: state });
      }),
    });

    renderHook(() => useReaderInitialization('story-1', { resumeExisting: true }));

    await waitFor(() => {
      expect(useAppStore.getState().playbackState?.currentSceneId).toBe('scene-1');
    });
    expect(hydrateReaderSceneWindow).toHaveBeenCalledWith('story-1', 'missing-scene');
    expect(hydrateReaderSceneWindow).toHaveBeenCalledWith('story-1', 'scene-1');
  });
});
