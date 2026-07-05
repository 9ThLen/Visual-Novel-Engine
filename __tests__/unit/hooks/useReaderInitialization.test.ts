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

  it('keeps serving the current scene when its record is transiently evicted from the store', async () => {
    // Regression test: navigateToScene() in app/reader.tsx awaits
    // hydrateReaderSceneWindow() for the *target* scene before committing the
    // new playbackState. That window hydration replaces the story's whole
    // scene map with a bounded set, which can momentarily omit the scene
    // still being displayed. Without a fallback, the hook would report a
    // null scene / empty timeline for a render where playbackState hasn't
    // moved on yet, causing the still-mounted executor to think the scene
    // completed and fire a bogus transition.
    const sceneA = makeSceneRecord('scene-a', 'story-1');
    sceneA.timeline = [
      { id: 'step-1', blockType: 'text', data: { content: 'hello' }, collapsed: false, enabled: true },
    ];

    useAppStore.setState({
      storiesMetadata: [storyMetadata],
      currentStoryId: 'story-1',
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'scene-a',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
      },
      sceneRecordsByStory: { 'story-1': { 'scene-a': sceneA } },
      hydrateReaderSceneWindow: vi.fn(async () => true),
      loadCurrentStory: vi.fn(async (storyId: string | null) => {
        useAppStore.setState({ currentStoryId: storyId });
      }),
      updatePlaybackState: vi.fn((state) => {
        useAppStore.setState({ playbackState: state });
      }),
    });

    const { result, rerender } = renderHook(() =>
      useReaderInitialization('story-1', { resumeExisting: true }),
    );

    await waitFor(() => {
      expect(result.current.timeline.length).toBe(1);
    });

    // Simulate the window-hydration eviction race: scene-a's record
    // disappears from the store while playbackState still points at it.
    useAppStore.setState({ sceneRecordsByStory: { 'story-1': {} } });
    rerender();

    expect(result.current.scene).not.toBeNull();
    expect(result.current.timeline.length).toBe(1);

    // Once playbackState genuinely moves to a scene with no cached record,
    // the fallback must not keep serving stale scene-a content.
    useAppStore.setState({
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'scene-b',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
      },
    });
    rerender();

    expect(result.current.scene).toBeNull();
    expect(result.current.timeline.length).toBe(0);
  });
});
