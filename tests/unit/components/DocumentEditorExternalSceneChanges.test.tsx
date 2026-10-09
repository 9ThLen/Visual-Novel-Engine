/**
 * A scene rewritten in the store has to reach the editor that is showing it.
 *
 * A frame takes its content once, when it is built. So after an applied AI
 * change, a rollback or a restored snapshot the open editor kept showing the
 * old text, and the next manual save wrote that old text back over the change.
 * The editor's own save changes the store as well, and must NOT rebuild the
 * frame: that would drop the caret on every save.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PlateSceneEditor } from '@/components/editor/plate/PlateSceneEditor';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
// Test-only seams; see the notes in the mocks themselves.
import {
  plateEditorFramesForTests,
  resetPlateEditorFramesForTests,
  setPlateEditorFlushForTests,
} from '../../mocks/components/vn-plate-editor/PlateWebViewEditor';
import { __setIsFocused } from '../../mocks/react-navigation-native';

const textStep = (id: string, content: string): TimelineStep => ({
  id, blockType: 'text', collapsed: false, enabled: true,
  data: { content, typewriterSpeed: 30, anchorTo: 'background' },
});

function record(content: string, overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Scene',
    description: '',
    tags: [],
    timeline: [textStep('step-1', content)],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

type EditorProps = React.ComponentProps<typeof PlateSceneEditor>;

/**
 * The editor as the route renders it, with the store played by the test:
 * `showStore` re-renders it with whatever the store would hold now.
 */
function renderEditor(initial: SceneRecord) {
  const onSave = vi.fn<EditorProps['onSave']>();
  const element = (scene: SceneRecord) => (
    <PlateSceneEditor
      storyId="story-1"
      sceneRecord={scene}
      scenes={[scene]}
      sceneIndex={0}
      sceneCount={1}
      characters={[]}
      backgroundAssets={[]}
      audioAssets={[]}
      onSave={onSave}
    />
  );
  const view = render(element(initial));
  return {
    onSave,
    showStore: async (scene: SceneRecord) => {
      view.rerender(element(scene));
      // Let the reset effect and the render it schedules both land, so "no
      // frame was rebuilt" is an observation and not a race.
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
}

/** Text a frame is showing — only ever what it was built from. */
function textsOf(frame: { builtFrom: { blocks: unknown[] } }): string[] {
  return (frame.builtFrom.blocks as { kind?: string; content?: string }[])
    .filter((block) => block.kind === 'text' && block.content)
    .map((block) => block.content as string);
}

const frames = () => plateEditorFramesForTests('scene-1');

describe('document editor and scenes rewritten from outside', () => {
  beforeEach(() => {
    setPlateEditorFlushForTests();
    resetPlateEditorFramesForTests({ reportsOnMount: false });
    __setIsFocused(true);
  });

  afterEach(() => {
    resetPlateEditorFramesForTests();
    __setIsFocused(true);
  });

  it('rebuilds the frame of a scene somebody else rewrote', async () => {
    const { showStore } = renderEditor(record('Rain.'));
    expect(frames()).toHaveLength(1);

    await showStore(record('Snow.', { updatedAt: 2 }));

    expect(frames()).toHaveLength(2);
    expect(textsOf(frames()[1])).toEqual(['Snow.']);
  });

  it('shows the old text again after a rollback', async () => {
    const original = record('Rain.');
    const { showStore } = renderEditor(original);

    await showStore(record('Snow.', { updatedAt: 2 }));
    // A restore brings back the old record, old timestamp included.
    await showStore(JSON.parse(JSON.stringify(original)) as SceneRecord);

    expect(frames()).toHaveLength(3);
    expect(textsOf(frames()[2])).toEqual(['Rain.']);
  });

  it('leaves the frame alone when the store echoes the editor’s own save', async () => {
    const { onSave, showStore } = renderEditor(record('Rain.'));

    // Every way out of the editor saves first; on the phone layout jsdom gets,
    // the preview button is the one within reach.
    fireEvent.click(screen.getByRole('button', { name: 'Preview Story' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [saved] = onSave.mock.calls[0][0];
    await showStore({ ...saved, updatedAt: 2 });

    expect(frames()).toHaveLength(1);

    // And the save did not blind it: the next outside write still gets through.
    await showStore(record('Snow.', { updatedAt: 3 }));

    expect(frames()).toHaveLength(2);
    expect(textsOf(frames()[1])).toEqual(['Snow.']);
  });

  it('does not rebuild for a change the frame never shows', async () => {
    const original = record('Rain.');
    const { showStore } = renderEditor(original);

    await showStore({
      ...original,
      connections: [{ targetSceneId: 'scene-2', outputPort: 'next', label: 'Next' }],
      updatedAt: 2,
    });

    expect(frames()).toHaveLength(1);
  });

  // Rebuilding would destroy the only copy of what the author just typed. AI
  // mutations save through the barrier first, so the two do not normally meet.
  it('keeps the frame of a scene with an unsaved draft', async () => {
    const { showStore } = renderEditor(record('Rain.'));
    const [frame] = frames();

    act(() => {
      frame.reportEdit({
        ...frame.builtFrom,
        blocks: [{ id: 'draft', kind: 'text', content: 'Rain. And a draft.' }],
      });
    });
    await showStore(record('Snow.', { updatedAt: 2 }));

    expect(frames()).toHaveLength(1);
  });

  // Scene-to-scene navigation stacks editor screens; each covered one sees
  // every save of the one on top as an outside write.
  it('waits until the author is back before rebuilding frames nobody sees', async () => {
    __setIsFocused(false);
    const { showStore } = renderEditor(record('Rain.'));
    const rewritten = record('Snow.', { updatedAt: 2 });

    await showStore(rewritten);
    expect(frames()).toHaveLength(1);

    __setIsFocused(true);
    await showStore(rewritten);

    expect(frames()).toHaveLength(2);
    expect(textsOf(frames()[1])).toEqual(['Snow.']);
  });
});
