import { act, render, waitFor } from '@testing-library/react';
import React from 'react';

import ReaderScreen from '@/app/reader';
import { enhancedAudioManager } from '@/lib/audio-manager-enhanced';
import { COMIC_FRAME_SOURCE, type ComicFrameStrip } from '@/lib/comic/comic-frame-protocol';
import { createEmptySceneState } from '@/lib/engine/conditionUtils';
import type { SceneConnection, SceneRecord, TimelineStep } from '@/lib/engine/types';
import { useAppStore } from '@/stores/use-app-store';
import { getRouterForTests, setLocalSearchParamsForTests } from '../../mocks/expo-router';
import { resetAppStoreState } from '../../mocks/stores/use-app-store';

// The reader screen at the end of a scene, read as a comic: the comic reader
// runs in jsdom through its real frame host, and the screen routes the scene's
// end exactly as it does for the novel.

function step(id: string, blockType: TimelineStep['blockType'], data: Record<string, unknown>): TimelineStep {
  return { id, blockType, data, collapsed: false, enabled: true } as unknown as TimelineStep;
}

function scene(id: string, timeline: TimelineStep[], connections: SceneConnection[] = []): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name: id,
    description: '',
    tags: [],
    timeline,
    sceneState: createEmptySceneState(),
    flowX: 0,
    flowY: 0,
    connections,
    isStart: id === 'scene-1',
    comic: { presentation: 'comic' },
    createdAt: 1,
    updatedAt: 1,
  };
}

const line = (id: string, content: string) => step(id, 'text', { content, typewriterSpeed: 0.5, anchorTo: 'background' });

function openReader(records: SceneRecord[]) {
  const updatePlaybackState = vi.fn();
  useAppStore.setState({
    storiesMetadata: [{ id: 'story-1', title: 'Story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: records.length }],
    currentStoryId: 'story-1',
    playbackState: {
      storyId: 'story-1',
      currentSceneId: 'scene-1',
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: [],
      variables: {},
    },
    sceneRecordsByStory: { 'story-1': Object.fromEntries(records.map((record) => [record.id, record])) },
    playbackGeneration: 0,
    endingsReachedByStory: {},
    hydrateReaderSceneWindow: vi.fn(async () => true),
    loadCurrentStory: vi.fn(async () => {}),
    recordEndingReached: vi.fn(),
    updatePlaybackState,
  });
  setLocalSearchParamsForTests({ storyId: 'story-1', resume: '1' });
  return { view: render(<ReaderScreen />), updatePlaybackState };
}

async function comicFrame(container: HTMLElement) {
  const iframe = await waitFor(() => {
    const found = container.querySelector('iframe');
    if (!found) throw new Error('no comic frame yet');
    return found;
  });
  const boot = /window\.__VNE_COMIC_BOOT = (\{.*?\});/.exec(iframe.getAttribute('srcdoc') ?? '')?.[1];
  const token = JSON.parse(boot ?? '{}').token;
  const posted = vi.spyOn(iframe.contentWindow!, 'postMessage');
  const send = (data: Record<string, unknown>) => act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: COMIC_FRAME_SOURCE, token, ...data },
      origin: window.location.origin,
      source: iframe.contentWindow,
    }));
  });
  const lastStrip = (): ComicFrameStrip | undefined => posted.mock.calls
    .map(([message]) => message as { type: string; strip?: ComicFrameStrip })
    .filter((message) => message.type === 'strip')
    .at(-1)?.strip;
  send({ type: 'ready' });
  await waitFor(() => expect(lastStrip()?.revealed).toBeGreaterThan(0));
  return { send, lastStrip };
}

const stopAll = vi.mocked(enhancedAudioManager.stopAll);

const endedTheStory = (updatePlaybackState: ReturnType<typeof vi.fn>) =>
  updatePlaybackState.mock.calls.some(([state]) => state.isPlaying === false);

describe('ReaderScreen at the end of a scene', () => {
  beforeEach(() => {
    resetAppStoreState();
    getRouterForTests().replace.mockClear();
    stopAll.mockClear();
  });

  afterEach(() => {
    setLocalSearchParamsForTests({});
  });

  // A choice that is the scene's last step also completes the run. The screen
  // used to hear that as a second move — "follow next" — and, with no next
  // connection, end the story under the navigation the pick had started:
  // music stopped, playback marked over, the route sent back to the tabs.
  it('goes where a choice at the scene\'s end leads, and does not end the story on the way', async () => {
    const { view, updatePlaybackState } = openReader([
      scene('scene-1', [
        line('door', 'The door creaks.'),
        step('pick', 'choice', { options: [{ id: 'in', text: 'Go in', targetSceneId: 'scene-2' }] }),
      ], [{ targetSceneId: 'scene-2', outputPort: 'choice_a' }]),
      scene('scene-2', [line('hall', 'A long hall.')]),
    ]);
    const frame = await comicFrame(view.container);

    frame.send({ type: 'tap' });
    await waitFor(() => expect(frame.lastStrip()?.choices?.options.map((option) => option.id)).toEqual(['in']));
    frame.send({ type: 'choose', optionId: 'in' });

    await waitFor(() => expect(updatePlaybackState).toHaveBeenCalledWith(expect.objectContaining({ currentSceneId: 'scene-2' })));
    await act(async () => {});

    expect(endedTheStory(updatePlaybackState)).toBe(false);
    expect(stopAll).not.toHaveBeenCalled();
    expect(getRouterForTests().replace).not.toHaveBeenCalled();
  });

  it('follows the next connection of a scene that runs out of steps', async () => {
    const { view, updatePlaybackState } = openReader([
      scene('scene-1', [line('door', 'The door creaks.')], [{ targetSceneId: 'scene-2', outputPort: 'next' }]),
      scene('scene-2', [line('hall', 'A long hall.')]),
    ]);
    const frame = await comicFrame(view.container);

    frame.send({ type: 'tap' });

    await waitFor(() => expect(updatePlaybackState).toHaveBeenCalledWith(expect.objectContaining({ currentSceneId: 'scene-2' })));
    await act(async () => {});
    expect(endedTheStory(updatePlaybackState)).toBe(false);
  });

  it('ends the story at a scene that runs out of steps with nowhere to go', async () => {
    const { view, updatePlaybackState } = openReader([
      scene('scene-1', [line('door', 'The door creaks.')]),
    ]);
    const frame = await comicFrame(view.container);

    frame.send({ type: 'tap' });

    await waitFor(() => expect(endedTheStory(updatePlaybackState)).toBe(true));
    expect(stopAll).toHaveBeenCalled();
    expect(useAppStore.getState().recordEndingReached).toHaveBeenCalledWith('story-1', 'scene-1');
  });
});
