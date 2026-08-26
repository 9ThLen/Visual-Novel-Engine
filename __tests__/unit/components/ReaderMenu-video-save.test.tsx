import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReaderMenu } from '@/components/ReaderMenu';
import { useAppStore } from '@/stores/use-app-store';
import { getRouterForTests } from '../../../__mocks__/expo-router';
import { resetAppStoreState } from '../../../__mocks__/stores/use-app-store';

describe('ReaderMenu cutscene save policy', () => {
  beforeEach(() => {
    resetAppStoreState();
    getRouterForTests().push.mockClear();
    useAppStore.setState({
      currentStoryId: 'story-1',
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'scene-1',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
        variables: {},
      },
      readerBlockingMedia: { stepId: 'video-1', kind: 'cutscene' },
      saveSlots: [],
      saveGame: vi.fn(),
      loadGame: vi.fn(),
      hydrateSceneRecordsForStory: vi.fn(),
    });
  });

  it('carries the cutscene save guard to the Save/Load screen while leaving Load available', () => {
    render(<ReaderMenu visible onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save / Load' }));

    expect(getRouterForTests().push).toHaveBeenCalledWith({
      pathname: '/save-load',
      params: { saveBlocked: 'cutscene' },
    });
  });
});
