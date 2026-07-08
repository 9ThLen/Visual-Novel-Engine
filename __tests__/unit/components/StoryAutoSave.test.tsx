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
    }));
  });
});
