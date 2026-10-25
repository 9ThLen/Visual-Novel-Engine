import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';

import { ComicReader } from '@/components/comic/ComicReader';
import { SceneRuntimeHost } from '@/components/reader/SceneRuntimeHost';
import { COMIC_FRAME_SOURCE, type ComicFrameStrip } from '@/lib/comic/comic-frame-protocol';
import type { TimelineStep } from '@/lib/engine/types';

// The reader driven through its real frame host: what it posts to the frame is
// what the reader would see, and the frame's messages are what a reader's taps
// and picks would send.

function step(id: string, blockType: TimelineStep['blockType'], data: Record<string, unknown>): TimelineStep {
  return { id, blockType, data, collapsed: false, enabled: true } as unknown as TimelineStep;
}

const timeline = [
  step('para', 'text', { content: 'The door creaks. Nobody comes.', typewriterSpeed: 0.5, anchorTo: 'background' }),
  step('line', 'dialogue', { entries: [{ id: 'e1', characterId: 'ann', speakerName: 'Ann', text: 'Hello?', spriteId: 's' }], currentEntryIndex: 0 }),
  step('pick', 'choice', { options: [{ id: 'left', text: 'Go left', targetSceneId: 'scene-left' }, { id: 'right', text: 'Go right', targetSceneId: null }] }),
];

function tokenOf(iframe: HTMLIFrameElement): string {
  const boot = /window\.__VNE_COMIC_BOOT = (\{.*?\});/.exec(iframe.getAttribute('srcdoc') ?? '')?.[1];
  return JSON.parse(boot ?? '{}').token;
}

function setup(props: Partial<React.ComponentProps<typeof ComicReader>> = {}) {
  const handlers = {
    onExecutorChoiceSelect: vi.fn(),
    onRollbackScene: vi.fn(),
    onSceneStateChange: vi.fn(),
    onTransition: vi.fn(),
  };
  const view = render(
    <SceneRuntimeHost timeline={timeline}>
      <ComicReader sceneId="scene-1" canRollbackScene {...handlers} {...props} />
    </SceneRuntimeHost>,
  );
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
  const back = () => fireEvent.click(view.getByRole('button'));
  fromFrame({ type: 'ready' });
  return { ...view, ...handlers, fromFrame, lastStrip, shown, back };
}

describe('ComicReader', () => {
  it('opens a paragraph one panel per tap, then moves on to the next stop', async () => {
    const reader = setup();
    await waitFor(() => expect(reader.shown()).toEqual(['The door creaks.']));

    reader.fromFrame({ type: 'tap' });
    await waitFor(() => expect(reader.shown()).toEqual(['The door creaks.', 'Nobody comes.']));

    reader.fromFrame({ type: 'tap' });
    await waitFor(() => expect(reader.shown()).toEqual(['The door creaks.', 'Nobody comes.', 'Hello?']));
    expect(reader.lastStrip().panels.at(-1)?.words[0]).toMatchObject({ kind: 'bubble', speaker: 'Ann' });
  });

  it('offers the choice at the end, and passes the pick on as the novel does', async () => {
    const reader = setup();
    for (const expected of [2, 3]) {
      reader.fromFrame({ type: 'tap' });
      await waitFor(() => expect(reader.shown()).toHaveLength(expected));
    }
    reader.fromFrame({ type: 'tap' });
    await waitFor(() => expect(reader.lastStrip().choices?.options.map((option) => option.id)).toEqual(['left', 'right']));

    reader.fromFrame({ type: 'tap' });
    reader.fromFrame({ type: 'choose', optionId: 'left' });

    await waitFor(() => expect(reader.lastStrip().choices?.chosenId).toBe('left'));
    expect(reader.onExecutorChoiceSelect).toHaveBeenCalledTimes(1);
    expect(reader.onExecutorChoiceSelect).toHaveBeenCalledWith({ sceneId: 'scene-1', choiceId: 'left', stepId: 'pick', targetSceneId: 'scene-left' });
    await waitFor(() => expect(reader.onTransition).toHaveBeenCalledWith('scene-left', expect.anything()));

    reader.fromFrame({ type: 'choose', optionId: 'right' });
    expect(reader.onExecutorChoiceSelect).toHaveBeenCalledTimes(1);
  });

  // The choice is the scene's last step, so the pick also completes the run.
  // The reader screen routes on completion, and must still hear one move: the
  // pick's, not a "next" after it that would end the story under it.
  it.each([
    { optionId: 'left', target: 'scene-left', mode: 'scene' },
    { optionId: 'right', target: null, mode: 'next' },
  ])('reports the pick of $optionId at the scene\'s end as one move, when the reader routes on completion', async ({ optionId, target, mode }) => {
    const reader = setup({ routeOnExecutorComplete: true });
    for (const expected of [2, 3]) {
      reader.fromFrame({ type: 'tap' });
      await waitFor(() => expect(reader.shown()).toHaveLength(expected));
    }
    reader.fromFrame({ type: 'tap' });
    await waitFor(() => expect(reader.lastStrip().choices?.options).toHaveLength(2));

    reader.fromFrame({ type: 'choose', optionId });
    await waitFor(() => expect(reader.onTransition).toHaveBeenCalled());
    await act(async () => {});

    expect(reader.onTransition).toHaveBeenCalledTimes(1);
    expect(reader.onTransition).toHaveBeenCalledWith(target, expect.objectContaining({ mode }));
  });

  it('goes back a panel, then a stop — landing with all its panels open — then asks for the previous scene', async () => {
    const reader = setup();
    reader.fromFrame({ type: 'tap' });
    reader.fromFrame({ type: 'tap' });
    await waitFor(() => expect(reader.shown()).toEqual(['The door creaks.', 'Nobody comes.', 'Hello?']));

    reader.back();
    await waitFor(() => expect(reader.shown()).toEqual(['The door creaks.', 'Nobody comes.']));
    expect(reader.lastStrip().panels.flatMap((panel) => panel.words.map((words) => words.text))).not.toContain('Hello?');

    reader.back();
    await waitFor(() => expect(reader.shown()).toEqual(['The door creaks.']));
    expect(reader.onRollbackScene).not.toHaveBeenCalled();

    reader.back();
    expect(reader.onRollbackScene).toHaveBeenCalledTimes(1);
  });

  it('reports the run\'s state, as the audio of the reader screen listens to it', async () => {
    const reader = setup();
    await waitFor(() => expect(reader.onSceneStateChange).toHaveBeenCalled());
    expect(reader.onSceneStateChange.mock.calls.at(-1)?.[0]).toHaveProperty('variables');
  });
});
