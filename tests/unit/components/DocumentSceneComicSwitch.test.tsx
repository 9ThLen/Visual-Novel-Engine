/**
 * The scene page's "Auto / Always comic / Always novel" switch, and the mark a
 * comic scene gets in the scene list. The setting lives on the record, not in
 * the document, so writing it must not rebuild the page the author is on.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { DocumentSceneSidebar } from '@/components/document-editor/DocumentSceneSidebar';
import { PlateSceneEditor } from '@/components/editor/plate/PlateSceneEditor';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  plateEditorFramesForTests,
  resetPlateEditorFramesForTests,
  setPlateEditorFlushForTests,
} from '../../mocks/components/vn-plate-editor/PlateWebViewEditor';
import { __setIsFocused } from '../../mocks/react-navigation-native';

const textStep: TimelineStep = {
  id: 'step-1', blockType: 'text', collapsed: false, enabled: true,
  data: { content: 'Rain.', typewriterSpeed: 30, anchorTo: 'background' },
};

const videoStep: TimelineStep = {
  id: 'step-video', blockType: 'video', collapsed: false, enabled: true,
  data: { mode: 'play', layer: 'cutscene', assetId: 'clip', loop: false, muted: false, volume: 1, fit: 'cover', skippable: true },
} as TimelineStep;

function record(overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Scene',
    description: '',
    tags: [],
    timeline: [textStep],
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

function renderEditor(initial: SceneRecord, onSetSceneComicPresentation?: EditorProps['onSetSceneComicPresentation']) {
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
      onSave={vi.fn()}
      onSetSceneComicPresentation={onSetSceneComicPresentation}
    />
  );
  const view = render(element(initial));
  return {
    showStore: async (scene: SceneRecord) => {
      view.rerender(element(scene));
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
}

const pill = () => screen.getByTestId('scene-comic-switch');

describe('the scene page comic switch', () => {
  beforeEach(() => {
    setPlateEditorFlushForTests();
    resetPlateEditorFramesForTests({ reportsOnMount: false });
    __setIsFocused(true);
  });

  afterEach(() => {
    resetPlateEditorFramesForTests();
  });

  it('sets the scene to always be read as a comic', () => {
    const onSet = vi.fn();
    renderEditor(record(), onSet);
    expect(pill().getAttribute('aria-label')).toBe('How this scene is read: Auto');

    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('radio', { name: /Always a comic/ }));

    expect(onSet).toHaveBeenCalledWith('scene-1', 'comic');
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('writes nothing when the setting the scene has is picked again', () => {
    const onSet = vi.fn();
    renderEditor(record({ comic: { presentation: 'novel' } }), onSet);

    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('radio', { name: /Always the novel/ }));

    expect(onSet).not.toHaveBeenCalled();
  });

  it('shows the setting the record now holds, without rebuilding the page', async () => {
    const original = record();
    const { showStore } = renderEditor(original, vi.fn());

    await showStore({ ...original, comic: { presentation: 'comic' }, updatedAt: 2 });

    expect(pill().getAttribute('aria-label')).toBe('How this scene is read: Always a comic');
    expect(pill().textContent).toContain('Comic');
    expect(plateEditorFramesForTests('scene-1')).toHaveLength(1);
  });

  it('says why a scene that plays a video is read as the novel', () => {
    renderEditor(record({ timeline: [textStep, videoStep], comic: { presentation: 'comic' } }), vi.fn());
    expect(pill().textContent).toContain('⚠');

    fireEvent.click(pill());

    expect(screen.getByTestId('scene-comic-novel-only').textContent).toMatch(/plays a video, so it is read as the novel/);
  });

  it('has no switch without somewhere to write the setting', () => {
    renderEditor(record());
    expect(screen.queryByTestId('scene-comic-switch')).toBeNull();
  });
});

describe('the scene list', () => {
  it('marks a scene that is always a comic, and warns when it is read as the novel all the same', () => {
    render(
      <DocumentSceneSidebar
        activeSceneId="plain"
        scenes={[
          record({ id: 'plain', name: 'Plain' }),
          record({ id: 'comic', name: 'Comic scene', comic: { presentation: 'comic' } }),
          record({ id: 'video', name: 'Video scene', timeline: [videoStep], comic: { presentation: 'comic' } }),
          record({ id: 'novel', name: 'Novel scene', comic: { presentation: 'novel' } }),
        ]}
        onScenePress={vi.fn()}
        onAddScene={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('scene-comic-badge-plain')).toBeNull();
    expect(screen.queryByTestId('scene-comic-badge-novel')).toBeNull();
    expect(screen.getByTestId('scene-comic-badge-comic').getAttribute('aria-label')).toBe('Read as a comic');
    expect(screen.getByTestId('scene-comic-badge-video').getAttribute('aria-label')).toBe('Set to be a comic, read as the novel');
  });
});
