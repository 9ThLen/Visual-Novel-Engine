/**
 * The save contract of DocumentSceneEditor — the regression test for the
 * data-loss bug fixed in R0.
 *
 * `handleSave` used to reject on a failed flush, which stopped whatever the
 * caller was about to do. Returning a boolean made that guarantee opt-in, and
 * every caller either replaces the document or leaves the screen: running one
 * on top of a failed save discards what the frames still hold.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DocumentSceneEditor } from '@/components/document-editor/DocumentSceneEditor';
import type { SceneRecord } from '@/lib/engine/types';
// Test-only seam; see the note in MediaLibraryRoute.test.tsx.
import { setPlateEditorFlushForTests } from '../../../__mocks__/components/vn-plate-editor/PlateWebViewEditor';

function record(): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Scene',
    description: '',
    tags: [],
    timeline: [],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function renderEditor(overrides: Record<string, unknown> = {}) {
  const scene = record();
  const props = {
    storyId: 'story-1',
    sceneRecord: scene,
    scenes: [scene],
    sceneIndex: 0,
    sceneCount: 1,
    initialDocuments: [{ sceneId: 'scene-1', name: 'Scene', blocks: [] }],
    documentsResetKey: 'key-1',
    characters: [],
    backgroundAssets: [],
    audioAssets: [],
    onSave: vi.fn(),
    onCreateNextScene: vi.fn(),
    ...overrides,
  };
  render(<DocumentSceneEditor {...(props as unknown as React.ComponentProps<typeof DocumentSceneEditor>)} />);
  return props;
}

/** A frame that refuses to hand over its content is what fails a save. */
function makeFlushFail() {
  setPlateEditorFlushForTests(async () => {
    throw new Error('frame did not respond');
  });
}

describe('DocumentSceneEditor save guard', () => {
  beforeEach(() => {
    setPlateEditorFlushForTests();
  });

  it('writes the document to the store on a clean save', async () => {
    const onBack = vi.fn();
    const { onSave } = renderEditor({ onBack });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onBack).toHaveBeenCalled();
  });

  it('joins a second save into the one already running', async () => {
    const { onSave } = renderEditor({ onPreview: vi.fn() });
    const preview = screen.getByRole('button', { name: 'Preview Story' });

    fireEvent.click(preview);
    fireEvent.click(preview);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does not leave the screen when the save failed', async () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    makeFlushFail();
    renderEditor({ onBack, onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    // Nothing reached the store, and the author stays where their edits are.
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
    expect(onBack).not.toHaveBeenCalled();
  });

  // The media library reads characters from the store, so an unsaved sprite is
  // simply missing from it — and the file the author then attaches to a
  // character lands next to a library the grid never showed them.
  it('saves before opening the media library and says which scene it left', async () => {
    const onGallery = vi.fn();
    const { onSave } = renderEditor({ onGallery });

    fireEvent.click(screen.getByRole('button', { name: 'Media library' }));

    await waitFor(() => expect(onGallery).toHaveBeenCalledWith('scene-1'));
    expect(onSave).toHaveBeenCalled();
  });

  it('does not open the media library when the save failed', async () => {
    const onGallery = vi.fn();
    const onSave = vi.fn();
    makeFlushFail();
    renderEditor({ onGallery, onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Media library' }));

    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
    expect(onGallery).not.toHaveBeenCalled();
  });

  it('does not open the preview when the save failed', async () => {
    const onPreview = vi.fn();
    const onSave = vi.fn();
    makeFlushFail();
    renderEditor({ onPreview, onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Preview Story' }));

    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
    expect(onPreview).not.toHaveBeenCalled();
  });
});
