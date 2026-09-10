import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TimelineStep } from '@/lib/engine/types';
import { PreviewScreen } from '@/components/editor/PreviewScreen';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { getRouterForTests } from '../../mocks/expo-router';
import { resetAppStoreState, useAppStore } from '../../mocks/stores/use-app-store';

// No vi.mock here on purpose: the setup's CJS loader resolves the screen's
// transitive imports itself, so a vi.mock of a project module never reaches
// them. The device choice goes through the real hook into jsdom's localStorage.

const textStep = (id: string, content: string): TimelineStep => ({
  id,
  blockType: 'text',
  data: { content, anchorTo: 'background' },
  collapsed: false,
  enabled: true,
} as TimelineStep);

const timeline = [
  textStep('t1', 'First line'),
  textStep('t2', 'Second line'),
  textStep('t3', 'Third line'),
];

function renderPreview() {
  return render(<PreviewScreen storyId="story-1" sceneId="scene-1" />);
}

/** Clicks the dialogue until the step counter reads `step`; a click mid-typewriter only finishes the line. */
async function advanceTo(step: number) {
  for (let attempt = 0; attempt < 6 && !screen.queryByText(`${step}/3`); attempt++) {
    fireEvent.click(await screen.findByText(/ line$/));
  }
  expect(screen.getByText(`${step}/3`)).toBeTruthy();
}

describe('PreviewScreen device switch', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAppStoreState();
    getRouterForTests().back.mockClear();
    useAppStore.setState({
      sceneRecordsByStory: {
        'story-1': { 'scene-1': { id: 'scene-1', storyId: 'story-1', timeline } },
      },
      settings: { sfxVolume: 1 },
    });
  });

  it('renders the scene at the chosen device size and remembers the choice', async () => {
    renderPreview();

    const device = screen.getByTestId('full-preview-device');
    expect(device.style.width).toBe('390px');
    expect(device.style.height).toBe('844px');

    fireEvent.click(screen.getByTestId('preview-device-desktop'));

    expect(device.style.width).toBe('1440px');
    expect(device.style.height).toBe('900px');
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEYS.EDITOR_PREVIEW_DEVICE)).toBe('desktop');
    });
  });

  it('opens on the remembered device', async () => {
    localStorage.setItem(STORAGE_KEYS.EDITOR_PREVIEW_DEVICE, 'desktop');

    renderPreview();

    // Starts on the default and switches once the stored choice is read.
    expect(screen.getByTestId('full-preview-device').style.width).toBe('390px');
    await waitFor(() => {
      expect(screen.getByTestId('full-preview-device').style.width).toBe('1440px');
    });
  });

  it('keeps the current step when the device changes', async () => {
    renderPreview();
    await advanceTo(2);
    await screen.findByText('Second line');

    fireEvent.click(screen.getByTestId('preview-device-desktop'));
    // Give a remount-driven reset the chance to show up before asserting.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByText('Second line')).toBeTruthy();
  });

  it('keeps the header clear of the inspector toggle and goes back from it', () => {
    renderPreview();

    const back = screen.getByTestId('full-preview-back');
    // PreviewInspector floats its toggle over the top-right corner.
    expect(back.parentElement?.style.paddingRight).toBe('64px');

    fireEvent.click(back);
    expect(getRouterForTests().back).toHaveBeenCalledTimes(1);
  });
});
