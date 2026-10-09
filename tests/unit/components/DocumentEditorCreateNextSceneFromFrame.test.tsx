/**
 * Creating the next scene from inside a frame is a save, and the editor has to
 * know it.
 *
 * The frame's «new scene» command hands its content to the host, which writes
 * every edited scene along with the new one and pushes the new scene's editor
 * on top. The editor underneath stays mounted. It used to keep its scenes
 * marked unsaved, and an editor with unsaved work in the scene it is on takes
 * nothing from the store — so it never saw what was saved from the screen above
 * it, and after the browser's Back button its next save wrote its old copy of
 * every scene over that work.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PlateSceneEditor } from '@/components/editor/plate/PlateSceneEditor';
import {
  connectSourceToNext,
  createNextSceneRecordAfter,
  insertSceneAfter,
} from '@/lib/document-editor/next-scene';
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

function record(id: string, content: string): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name: id,
    description: '',
    tags: [],
    timeline: [textStep(`${id}-step`, content)],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: id === 'scene-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

/** The story's scenes as the store keeps them: in order, every write stamped. */
function createStory(initial: SceneRecord[]) {
  let clock = 1;
  let order = initial.map((scene) => scene.id);
  const records = new Map(initial.map((scene) => [scene.id, scene]));
  let ordered: SceneRecord[] | null = null;
  const story = {
    scenes: (): SceneRecord[] => {
      ordered ??= order.flatMap((id) => records.get(id) ?? []);
      return ordered;
    },
    scene: (id: string) => records.get(id) as SceneRecord,
    save: (scene: SceneRecord) => {
      clock += 1;
      records.set(scene.id, { ...scene, updatedAt: clock });
      if (!order.includes(scene.id)) order.push(scene.id);
      ordered = null;
    },
    reorder: (sceneIds: string[]) => {
      order = sceneIds;
      ordered = null;
    },
    textsOf: (id: string): string[] => story.scene(id).timeline
      .filter((step) => step.blockType === 'text')
      .map((step) => (step.data as { content?: string }).content ?? '')
      .filter(Boolean),
  };
  return story;
}

type EditorProps = React.ComponentProps<typeof PlateSceneEditor>;

/**
 * The editor on scene-1 as the route renders it, with the store played by the
 * test: `showStore` re-renders it with whatever the story holds now.
 */
function renderEditor(story: ReturnType<typeof createStory>, options: { hostCreatesScene?: boolean } = {}) {
  // What the route does with the records the editor hands it.
  const createNextScene: EditorProps['onCreateNextScene'] = (sourceSceneId, editedRecords) => {
    if (options.hostCreatesScene === false) return false;
    const recordsById = new Map(story.scenes().map((scene) => [scene.id, scene]));
    editedRecords.forEach((edited) => recordsById.set(edited.id, edited));
    const source = recordsById.get(sourceSceneId);
    if (!source) return false;
    const next = createNextSceneRecordAfter(source, [...recordsById.values()]);
    connectSourceToNext([...recordsById.values(), next], sourceSceneId, next.id).forEach(story.save);
    story.reorder(insertSceneAfter([...recordsById.keys()], sourceSceneId, next.id));
    return true;
  };
  const element = () => (
    <PlateSceneEditor
      storyId="story-1"
      sceneRecord={story.scene('scene-1')}
      scenes={story.scenes()}
      sceneIndex={0}
      sceneCount={story.scenes().length}
      characters={[]}
      backgroundAssets={[]}
      audioAssets={[]}
      onSave={(records) => records.forEach(story.save)}
      onCreateNextScene={createNextScene}
    />
  );
  const view = render(element());
  return {
    showStore: async () => {
      view.rerender(element());
      // Let the reset effect and the render it schedules both land.
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
}

type Frame = ReturnType<typeof plateEditorFramesForTests>[number];

const latestFrame = (sceneId: string) => plateEditorFramesForTests(sceneId).at(-1) as Frame;

/** Text a frame is showing — only ever what it was built from. */
function shownIn(frame: Frame): string[] {
  return (frame.builtFrom.blocks as { kind?: string; content?: string }[])
    .filter((block) => block.kind === 'text' && block.content)
    .map((block) => block.content as string);
}

const typed = (frame: Frame, content: string) => ({
  ...frame.builtFrom,
  blocks: [{ id: 'typed', kind: 'text', content }],
});

/** Every way out of the editor saves first; jsdom's phone layout offers this one. */
function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Preview Story' }));
}

describe('document editor after a scene was created from inside a frame', () => {
  beforeEach(() => {
    setPlateEditorFlushForTests();
    resetPlateEditorFramesForTests({ reportsOnMount: false });
    __setIsFocused(true);
  });

  afterEach(() => {
    resetPlateEditorFramesForTests();
    __setIsFocused(true);
  });

  it('keeps what the next editor screen saved when the author comes back and saves', async () => {
    const story = createStory([record('scene-1', 'Rain.'), record('scene-2', 'Fog.')]);
    const { showStore } = renderEditor(story);
    const frame = latestFrame('scene-1');

    // The author writes a line, then asks for the next scene from the frame.
    const draft = typed(frame, 'Rain. Then thunder.');
    act(() => frame.reportEdit(draft));
    act(() => frame.requestNextScene(draft));
    // The route has pushed the new scene's editor on top of this one.
    __setIsFocused(false);
    await showStore();
    expect(story.textsOf('scene-1')).toEqual(['Rain. Then thunder.']);
    expect(story.scenes()).toHaveLength(3);

    // Up there the author rewrites scene 2 and saves.
    story.save({ ...story.scene('scene-2'), timeline: [textStep('scene-2-step', 'Storm.')] });
    await showStore();

    // The browser's Back button: this editor is in front again.
    __setIsFocused(true);
    await showStore();
    expect(shownIn(latestFrame('scene-2'))).toEqual(['Storm.']);

    // One more line here, and a save.
    act(() => latestFrame('scene-1').reportEdit(typed(frame, 'Rain. Thunder. Wind.')));
    save();
    await waitFor(() => expect(story.textsOf('scene-1')).toEqual(['Rain. Thunder. Wind.']));

    expect(story.textsOf('scene-2')).toEqual(['Storm.']);
  });

  // The host writes nothing when it cannot find the scene to continue from.
  // What the frame sent with the request is then an unsaved draft — one the
  // frame will not report again, typed too fast to have been reported before —
  // and a reset from the store must not take it for saved.
  it('keeps the draft unsaved when the host did not create the scene', async () => {
    const story = createStory([record('scene-1', 'Rain.'), record('scene-2', 'Fog.')]);
    const { showStore } = renderEditor(story, { hostCreatesScene: false });
    const frame = latestFrame('scene-1');

    act(() => frame.requestNextScene(typed(frame, 'Rain. Then thunder.')));
    expect(story.textsOf('scene-1')).toEqual(['Rain.']);

    // Any later write to the story offers the editor a reset.
    story.save({ ...story.scene('scene-2'), timeline: [textStep('scene-2-step', 'Storm.')] });
    await showStore();

    save();
    await waitFor(() => expect(story.textsOf('scene-1')).toEqual(['Rain. Then thunder.']));
  });
});
