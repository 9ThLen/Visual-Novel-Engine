import { act, render, waitFor } from '@testing-library/react';
import React from 'react';

import { SceneRuntimeHost, useSceneRuntime, type SceneRuntime } from '@/components/reader/SceneRuntimeHost';
import type { TimelineStep } from '@/lib/engine/types';

function step(id: string, blockType: TimelineStep['blockType'], data: Record<string, unknown>): TimelineStep {
  return { id, blockType, data, collapsed: false, enabled: true } as unknown as TimelineStep;
}

// `score += 1` and two lines to read.
const timeline = [
  step('score', 'variable', { variableName: 'score', operation: 'add', value: 1 }),
  step('a', 'text', { content: 'First.', typewriterSpeed: 0.5, anchorTo: 'background' }),
  step('b', 'text', { content: 'Second.', typewriterSpeed: 0.5, anchorTo: 'background' }),
];

/** Stands for a way of showing the scene: the novel reader, or the comic reader. */
function View({ seen }: { seen: (runtime: SceneRuntime) => void }) {
  seen(useSceneRuntime());
  return null;
}

describe('SceneRuntimeHost', () => {
  it('runs the scene once for whichever view shows it, so switching views neither restarts it nor counts twice', async () => {
    let novel: SceneRuntime | null = null;
    let comic: SceneRuntime | null = null;
    const { rerender } = render(
      <SceneRuntimeHost timeline={timeline} initialVariables={{ score: 5 }}>
        <View seen={(runtime) => { novel = runtime; }} />
      </SceneRuntimeHost>,
    );
    await waitFor(() => expect(novel?.journal.map((entry) => entry.stepId)).toEqual(['a']));
    act(() => novel!.advance());
    await waitFor(() => expect(novel?.isTyping).toBe(false));
    act(() => novel!.advance());
    await waitFor(() => expect(novel?.journal.map((entry) => entry.stepId)).toEqual(['a', 'b']));
    const journal = novel!.journal;

    rerender(
      <SceneRuntimeHost timeline={timeline} initialVariables={{ score: 5 }}>
        <View seen={(runtime) => { comic = runtime; }} />
      </SceneRuntimeHost>,
    );

    expect(comic!.sceneState.variables.score).toBe(6);
    expect(comic!.journal).toBe(journal);
    expect(comic!.timeline).toBe(timeline);
  });

  it('starts again from the variables the scene was entered with when the run is reset', async () => {
    let runtime: SceneRuntime | null = null;
    const seen = (value: SceneRuntime) => { runtime = value; };
    const { rerender } = render(
      <SceneRuntimeHost timeline={timeline} initialVariables={{ score: 5 }} resetKey={1}>
        <View seen={seen} />
      </SceneRuntimeHost>,
    );
    await waitFor(() => expect(runtime?.sceneState.variables.score).toBe(6));

    rerender(
      <SceneRuntimeHost timeline={timeline} initialVariables={{ score: 5 }} resetKey={2}>
        <View seen={seen} />
      </SceneRuntimeHost>,
    );

    await waitFor(() => expect(runtime?.journal.map((entry) => entry.stepId)).toEqual(['a']));
    expect(runtime!.sceneState.variables.score).toBe(6);
  });

  it('is required: a view outside a host is a mistake, not a second run', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<View seen={() => {}} />)).toThrow('SceneRuntimeHost');
    error.mockRestore();
  });
});
