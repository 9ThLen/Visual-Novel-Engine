import React from 'react';
import { act, render } from '@testing-library/react';
import { StoryAutoSave } from '@/components/StoryAutoSave';
import { useAppStore } from '@/stores/use-app-store';
import { createEmptySceneState } from '@/lib/engine/conditionUtils';
import type { SceneRecord } from '@/lib/engine/types';

function makeScene(id: string, storyId: string): SceneRecord {
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
    isStart: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('StoryAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({
      storiesMetadata: [],
      sceneRecordsByStory: {},
      currentStoryId: null,
      playbackState: null,
      readerBlockingMedia: null,
      readerSceneThumbnailUri: undefined,
      saveSlots: [],
      syncAutoSave: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('autosaves from the active story and scene', () => {
    const syncAutoSave = vi.fn();
    useAppStore.setState({
      storiesMetadata: [
        { id: 'story-1', title: 'Active story', sceneCount: 1, startSceneId: 'scene-1', createdAt: 0, updatedAt: 0 },
        { id: 'story-2', title: 'Other story', sceneCount: 1, startSceneId: 'other-scene', createdAt: 0, updatedAt: 0 },
      ],
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': makeScene('scene-1', 'story-1'),
          'scene-2': makeScene('scene-2', 'story-1'),
        },
        'story-2': {
          'other-scene': makeScene('other-scene', 'story-2'),
        },
      },
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'scene-1',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
        variables: { flag: true },
      },
      syncAutoSave,
      readerSceneThumbnailUri: 'poster-active',
    });

    render(<StoryAutoSave />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(syncAutoSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'autosave',
      storyId: 'story-1',
      sceneId: 'scene-1',
      storyTitle: 'Active story',
      sceneName: 'scene-1',
      variables: { flag: true },
      thumbnailUri: 'poster-active',
    }));
  });

  it('stands down while a cutscene owns the screen and resumes when it ends', () => {
    const syncAutoSave = vi.fn();
    useAppStore.setState({
      storiesMetadata: [
        { id: 'story-1', title: 'Active story', sceneCount: 1, startSceneId: 'scene-1', createdAt: 0, updatedAt: 0 },
      ],
      sceneRecordsByStory: {
        'story-1': { 'scene-1': makeScene('scene-1', 'story-1') },
      },
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'scene-1',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
        variables: {},
      },
      readerBlockingMedia: { stepId: 'video-1', kind: 'cutscene' },
      syncAutoSave,
    });

    const { rerender } = render(<StoryAutoSave />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // A slot written mid-clip records the scene but not the clip, so resuming
    // it would either replay or skip the cutscene with no way to tell which
    // the author meant.
    expect(syncAutoSave).not.toHaveBeenCalled();

    act(() => {
      useAppStore.setState({ readerBlockingMedia: null });
    });
    rerender(<StoryAutoSave />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(syncAutoSave).toHaveBeenCalled();
  });
});
