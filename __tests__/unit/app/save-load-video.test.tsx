import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SaveLoadScreen from '@/app/save-load';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { useAppStore } from '@/stores/use-app-store';
import { setLocalSearchParamsForTests } from '../../../__mocks__/expo-router';
import { resetAppStoreState } from '../../../__mocks__/stores/use-app-store';

function seedSaveScreen() {
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
    readerBlockingMedia: null,
    saveSlots: [{
      id: 'slot-1',
      storyId: 'story-1',
      sceneId: 'scene-1',
      choicesMade: [],
      variables: {},
      timestamp: 1,
      thumbnailUri: 'poster-asset-id',
      storyTitle: 'Story',
    }],
    saveGame: vi.fn(),
    loadGame: vi.fn(),
    deleteSaveSlot: vi.fn(),
    hydrateSceneRecordsForStory: vi.fn(),
  });
}

describe('Save/Load video integration', () => {
  beforeEach(() => {
    resetAppStoreState();
    setLocalSearchParamsForTests({});
    vi.mocked(resolveAssetUri).mockResolvedValue('blob:resolved-poster');
    seedSaveScreen();
  });

  afterEach(() => {
    setLocalSearchParamsForTests({});
  });

  it('resolves a stable thumbnail asset reference before rendering it', async () => {
    const { container } = render(<SaveLoadScreen />);

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:resolved-poster');
    });
    expect(resolveAssetUri).toHaveBeenCalledWith('poster-asset-id');
  });

  it('keeps loading available but disables manual saving after leaving a cutscene', async () => {
    setLocalSearchParamsForTests({ saveBlocked: 'cutscene' });
    const { container } = render(<SaveLoadScreen />);

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:resolved-poster');
    });

    expect((screen.getByRole('button', { name: 'Load' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Saving is paused until the cutscene finishes.')).not.toBeNull();
  });
});
