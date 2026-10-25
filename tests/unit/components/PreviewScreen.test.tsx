import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TimelineStep } from '@/lib/engine/types';
import { PreviewScreen } from '@/components/editor/PreviewScreen';
import { COMIC_FRAME_SOURCE, type ComicFrameStrip } from '@/lib/comic/comic-frame-protocol';
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

// A scene set to always be a comic is read as the reader reads it: its run is
// driven through the comic frame's real host, as in ComicReader.test.tsx.

function step(id: string, blockType: TimelineStep['blockType'], data: Record<string, unknown>, extra: Partial<TimelineStep> = {}): TimelineStep {
  return { id, blockType, data, collapsed: false, enabled: true, ...extra } as unknown as TimelineStep;
}
const words = (id: string, content: string, extra?: Partial<TimelineStep>) =>
  step(id, 'text', { content, typewriterSpeed: 0.5, anchorTo: 'background' }, extra);
const choice = (id: string, targetSceneId: string | null) =>
  step(id, 'choice', { options: [{ id: 'go', text: 'Go on', targetSceneId }] });

interface StoredScene {
  timeline: TimelineStep[];
  comic?: boolean;
  next?: string;
}

function storeScenes(scenes: Record<string, StoredScene>) {
  useAppStore.setState({
    sceneRecordsByStory: {
      'story-1': Object.fromEntries(Object.entries(scenes).map(([id, scene]) => [id, {
        id,
        storyId: 'story-1',
        name: id,
        timeline: scene.timeline,
        connections: scene.next ? [{ outputPort: 'next', targetSceneId: scene.next }] : [],
        isStart: id === 'scene-1',
        ...(scene.comic ? { comic: { presentation: 'comic' } } : {}),
      }])),
    },
    settings: { sfxVolume: 1 },
  });
}

function tokenOf(iframe: HTMLIFrameElement): string {
  const boot = /window\.__VNE_COMIC_BOOT = (\{.*?\});/.exec(iframe.getAttribute('srcdoc') ?? '')?.[1];
  return JSON.parse(boot ?? '{}').token;
}

/** The comic frame inside the device, as a reader's taps and picks would drive it. */
function comicFrame() {
  const iframe = screen.getByTestId('full-preview-device').querySelector('iframe')!;
  expect(iframe).not.toBeNull();
  const token = tokenOf(iframe);
  const posted = vi.spyOn(iframe.contentWindow!, 'postMessage');
  const send = (data: Record<string, unknown>) => act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: COMIC_FRAME_SOURCE, token, ...data },
      origin: window.location.origin,
      source: iframe.contentWindow,
    }));
  });
  const lastStrip = (): ComicFrameStrip => {
    const strips = posted.mock.calls.map(([message]) => message as { type: string; strip?: ComicFrameStrip }).filter((message) => message.type === 'strip');
    return strips[strips.length - 1]!.strip!;
  };
  const shown = () => {
    const strip = lastStrip();
    return strip.panels.slice(0, strip.revealed).flatMap((panel) => panel.words.map((item) => item.text));
  };
  send({ type: 'ready' });
  return { iframe, tap: () => send({ type: 'tap' }), choose: (optionId: string) => send({ type: 'choose', optionId }), lastStrip, shown };
}

describe('PreviewScreen comic scenes', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAppStoreState();
    getRouterForTests().back.mockClear();
  });

  it('reads a scene set to always be a comic as the comic, at the chosen device size', async () => {
    storeScenes({ 'scene-1': { comic: true, timeline: [words('w', 'The door creaks. Nobody comes.')] } });
    renderPreview();

    const frame = comicFrame();
    await waitFor(() => expect(frame.shown()).toEqual(['The door creaks.']));
    expect(screen.queryByRole('button', { name: 'Continue reading' })).toBeNull();

    frame.tap();
    await waitFor(() => expect(frame.shown()).toEqual(['The door creaks.', 'Nobody comes.']));

    // The device changes around the same frame and the same run.
    const device = screen.getByTestId('full-preview-device');
    fireEvent.click(screen.getByTestId('preview-device-desktop'));
    expect(device.style.width).toBe('1440px');
    expect(device.querySelector('iframe')).toBe(frame.iframe);
    expect(frame.shown()).toEqual(['The door creaks.', 'Nobody comes.']);
  });

  it.each([
    ['plays a video', step('clip', 'video', { mode: 'play', layer: 'background', assetId: 'clip.mp4' })],
    ['holds an interactive object', step('lamp', 'interactive_object', { objectId: 'lamp', name: 'Lamp', position: { x: 0.5, y: 0.5 }, actions: [] })],
  ])('reads a scene set to be a comic as the novel when it %s', async (_reason, novelOnly) => {
    storeScenes({ 'scene-1': { comic: true, timeline: [words('w', 'First line'), novelOnly] } });
    renderPreview();

    expect(await screen.findByRole('button', { name: 'Continue reading' })).toBeTruthy();
    expect(screen.getByTestId('full-preview-device').querySelector('iframe')).toBeNull();
  });

  it('offers the choice at the end and goes on to the scene it leads to, in the same strip', async () => {
    storeScenes({
      'scene-1': { comic: true, timeline: [words('a', 'A one. A two.'), choice('pick', 'scene-2')] },
      'scene-2': { comic: true, timeline: [words('b', 'B one.')] },
    });
    renderPreview();
    const frame = comicFrame();

    await waitFor(() => expect(frame.shown()).toEqual(['A one.']));
    frame.tap();
    await waitFor(() => expect(frame.shown()).toEqual(['A one.', 'A two.']));
    frame.tap();
    await waitFor(() => expect(frame.lastStrip().choices?.options.map((option) => option.text)).toEqual(['Go on']));

    frame.choose('go');

    await waitFor(() => expect(frame.shown()).toEqual(['A one.', 'A two.', 'B one.']));
    expect(screen.getByTestId('full-preview-device').querySelector('iframe')).toBe(frame.iframe);
    expect(screen.getByText('1/1')).toBeTruthy();
    // The choice was the scene's last step: it moved on once, not again as a scene run out.
    expect(screen.queryByText('Scene complete - tap to exit preview')).toBeNull();
  });

  it('carries the variables the comic scene set into the next one', async () => {
    storeScenes({
      'scene-1': {
        comic: true,
        timeline: [
          step('mark', 'variable', { variableName: 'seen', operation: 'set', value: true }),
          words('a', 'A one.'),
          choice('pick', 'scene-2'),
        ],
      },
      'scene-2': {
        comic: true,
        timeline: [
          words('b-seen', 'You have seen it.', { conditions: [{ variableName: 'seen', operator: '==', value: true }] }),
          words('b-new', 'You are new here.', { conditions: [{ variableName: 'seen', operator: '!=', value: true }] }),
        ],
      },
    });
    renderPreview();
    const frame = comicFrame();

    await waitFor(() => expect(frame.shown()).toEqual(['A one.']));
    frame.tap();
    await waitFor(() => expect(frame.lastStrip().choices).toBeTruthy());
    frame.choose('go');

    await waitFor(() => expect(frame.shown()).toContain('You have seen it.'));
    expect(frame.shown()).not.toContain('You are new here.');
  });

  it('follows the next connection when the comic scene runs out, and returns to the novel', async () => {
    storeScenes({
      'scene-1': { comic: true, next: 'scene-2', timeline: [words('a', 'A one.')] },
      'scene-2': { timeline: [words('n', 'Novel line')] },
    });
    renderPreview();
    const frame = comicFrame();

    await waitFor(() => expect(frame.shown()).toEqual(['A one.']));
    frame.tap();

    expect(await screen.findByRole('button', { name: 'Continue reading' })).toBeTruthy();
    // The strip slides away, then leaves.
    await waitFor(() => expect(screen.getByTestId('full-preview-device').querySelector('iframe')).toBeNull());
  });

  it('ends where the story would, and goes back from there', async () => {
    storeScenes({ 'scene-1': { comic: true, timeline: [words('a', 'Only words.')] } });
    renderPreview();
    const frame = comicFrame();

    await waitFor(() => expect(frame.shown()).toEqual(['Only words.']));
    expect(screen.queryByText('Scene complete - tap to exit preview')).toBeNull();
    frame.tap();

    fireEvent.click(await screen.findByText('Scene complete - tap to exit preview'));
    expect(getRouterForTests().back).toHaveBeenCalledTimes(1);
  });
});
