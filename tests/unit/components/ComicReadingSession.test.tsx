import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { Text } from 'react-native';

import { ComicReader } from '@/components/comic/ComicReader';
import { COMIC_EXIT_MS, ComicReadingSession } from '@/components/comic/ComicReadingSession';
import { SceneRuntimeHost } from '@/components/reader/SceneRuntimeHost';
import { COMIC_FRAME_SOURCE, type ComicFrameStrip } from '@/lib/comic/comic-frame-protocol';
import type { TimelineStep } from '@/lib/engine/types';

// The session as the reader screen uses it: one session, a host per scene
// keyed by the scene, and the comic reader (or the novel) inside.

function step(id: string, blockType: TimelineStep['blockType'], data: Record<string, unknown>): TimelineStep {
  return { id, blockType, data, collapsed: false, enabled: true } as unknown as TimelineStep;
}
const text = (id: string, content: string) => step(id, 'text', { content, typewriterSpeed: 0.5, anchorTo: 'background' });

const sceneA = { id: 'a', timeline: [text('a-words', 'A one. A two.'), step('a-pick', 'choice', { options: [{ id: 'go', text: 'Go on', targetSceneId: 'b' }, { id: 'stay', text: 'Stay', targetSceneId: null }] })] };
const sceneB = { id: 'b', timeline: [text('b-words', 'B one.')] };
const novel = { id: 'n', timeline: [text('n-words', 'Novel words.')] };

interface ScreenProps {
  scene: { id: string; timeline: TimelineStep[] };
  comic?: boolean;
  generation?: number;
  onRollbackScene?: () => void;
}

function Screen({ scene, comic = true, generation = 0, onRollbackScene }: ScreenProps) {
  return (
    <ComicReadingSession active={comic} storyId="story" resetKey={generation}>
      <SceneRuntimeHost key={`${scene.id}:${generation}`} timeline={scene.timeline}>
        {comic
          ? <ComicReader sceneId={scene.id} canRollbackScene onRollbackScene={onRollbackScene} />
          : <Text>novel</Text>}
      </SceneRuntimeHost>
    </ComicReadingSession>
  );
}

function tokenOf(iframe: HTMLIFrameElement): string {
  const boot = /window\.__VNE_COMIC_BOOT = (\{.*?\});/.exec(iframe.getAttribute('srcdoc') ?? '')?.[1];
  return JSON.parse(boot ?? '{}').token;
}

function setup(props: ScreenProps) {
  const view = render(<Screen {...props} />);
  const iframe = view.container.querySelector('iframe')!;
  const token = tokenOf(iframe);
  const posted = vi.spyOn(iframe.contentWindow!, 'postMessage');
  const fromFrame = (data: Record<string, unknown>) => act(() => {
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
    return strip.panels.slice(0, strip.revealed).flatMap((panel) => panel.words.map((words) => words.text));
  };
  fromFrame({ type: 'ready' });
  return { ...view, iframe, fromFrame, lastStrip, shown };
}

async function readSceneA(screen: ReturnType<typeof setup>) {
  await waitFor(() => expect(screen.shown()).toEqual(['A one.']));
  screen.fromFrame({ type: 'tap' });
  await waitFor(() => expect(screen.shown()).toEqual(['A one.', 'A two.']));
  screen.fromFrame({ type: 'tap' });
  await waitFor(() => expect(screen.lastStrip().choices).not.toBeNull());
  screen.fromFrame({ type: 'choose', optionId: 'go' });
  await waitFor(() => expect(screen.lastStrip().choices?.chosenId).toBe('go'));
}

describe('ComicReadingSession', () => {
  it('continues the strip in the next comic scene, in the same frame, with the answer where it was given', async () => {
    const screen = setup({ scene: sceneA });
    await readSceneA(screen);

    screen.rerender(<Screen scene={sceneB} />);

    await waitFor(() => expect(screen.shown()).toEqual(['A one.', 'A two.', 'B one.']));
    expect(screen.container.querySelector('iframe')).toBe(screen.iframe);
    const strip = screen.lastStrip();
    expect(strip.panels[1].choices).toEqual(expect.objectContaining({ chosenId: 'go' }));
    expect(strip.choices).toBeNull();
    expect(new Set(strip.panels.map((panel) => panel.id)).size).toBe(strip.panels.length);
  });

  it('takes a scene and the one before it off the strip when the reader goes back from its start', async () => {
    const onRollbackScene = vi.fn();
    const screen = setup({ scene: sceneA, onRollbackScene });
    await readSceneA(screen);
    screen.rerender(<Screen scene={sceneB} onRollbackScene={onRollbackScene} />);
    await waitFor(() => expect(screen.shown()).toEqual(['A one.', 'A two.', 'B one.']));

    fireEvent.click(screen.getByRole('button'));
    expect(onRollbackScene).toHaveBeenCalledTimes(1);
    // The screen goes back to the scene before, which replays from its start.
    screen.rerender(<Screen scene={sceneA} onRollbackScene={onRollbackScene} />);

    await waitFor(() => expect(screen.shown()).toEqual(['A one.']));
    expect(screen.lastStrip().panels.flatMap((panel) => panel.words.map((words) => words.text))).not.toContain('B one.');
    // Rebuilt in the same frame, not a new one.
    expect(screen.container.querySelector('iframe')).toBe(screen.iframe);
  });

  it('lets the strip slide away when the story goes back to the novel, then ends it', async () => {
    const screen = setup({ scene: sceneA });
    await waitFor(() => expect(screen.shown()).toEqual(['A one.']));
    vi.useFakeTimers();
    try {
      screen.rerender(<Screen scene={novel} comic={false} />);
      expect(screen.getByText('novel')).toBeTruthy();
      expect(screen.container.querySelector('iframe')).toBe(screen.iframe);

      act(() => { vi.advanceTimersByTime(COMIC_EXIT_MS); });

      expect(screen.container.querySelector('iframe')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts over when a save is loaded', async () => {
    const screen = setup({ scene: sceneA });
    await readSceneA(screen);
    screen.rerender(<Screen scene={sceneB} />);
    await waitFor(() => expect(screen.shown()).toEqual(['A one.', 'A two.', 'B one.']));

    screen.rerender(<Screen scene={sceneB} generation={1} />);

    await waitFor(() => expect(screen.shown()).toEqual(['B one.']));
  });
});
