/**
 * The inspector's Preview in its comic format: the author's plan, panel by
 * panel, beside the novel's frames; and "Read the scene as a comic", which
 * runs the scene in the reader's own comic view.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DocumentInspectorPanel } from '@/components/document-editor/DocumentInspectorPanel';
import type { DocumentBlock, DocumentScene } from '@/lib/document-editor/types';
import type { ScenePresentation, TimelineStep } from '@/lib/engine/types';

const words = (id: string, content: string): DocumentBlock => ({ id, kind: 'text', content });

function scene(blocks: DocumentBlock[] = [words('rain', 'Rain falls. Wind howls.'), words('thunder', 'Thunder.')]): DocumentScene {
  return { sceneId: 'scene-1', sceneName: 'Storm', blocks };
}

const playingVideo: DocumentBlock = {
  id: 'clip',
  kind: 'technical',
  commandId: 'video',
  blockType: 'video',
  label: 'Video',
  summary: '',
  step: {
    id: 'clip', blockType: 'video', collapsed: false, enabled: true,
    data: { mode: 'play', layer: 'cutscene', assetId: 'clip', loop: false, muted: false, volume: 1, fit: 'cover', skippable: true },
  } as TimelineStep,
};

function renderInspector(documentScene: DocumentScene, comicPresentation?: ScenePresentation) {
  return render(
    <DocumentInspectorPanel
      scene={documentScene}
      storyId="story-1"
      characters={[]}
      storyScenes={[]}
      comicSettings={comicPresentation ? { presentation: comicPresentation } : undefined}
    />,
  );
}

const counter = () => screen.getByTestId('preview-frame-counter').textContent;

describe('the Preview in the comic format', () => {
  it('draws a scene that is always a comic as its panels, and steps through them', () => {
    renderInspector(scene(), 'comic');

    expect(screen.getByTestId('comic-preview-stage')).toBeTruthy();
    expect(counter()).toBe('Panel 1 / 3');

    fireEvent.click(screen.getByRole('button', { name: 'Next panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next panel' }));
    expect(counter()).toBe('Panel 3 / 3');

    fireEvent.click(screen.getByRole('button', { name: 'Previous panel' }));
    expect(counter()).toBe('Panel 2 / 3');
  });

  it('draws a scene read as the novel as frames, until the author picks the comic', () => {
    renderInspector(scene());
    expect(screen.queryByTestId('comic-preview-stage')).toBeNull();
    expect(counter()).toMatch(/^Frame 1 \//);

    fireEvent.click(screen.getByRole('radio', { name: 'Comic' }));

    expect(screen.getByTestId('comic-preview-stage')).toBeTruthy();
    expect(counter()).toBe('Panel 1 / 3');

    fireEvent.click(screen.getByRole('radio', { name: 'Novel' }));
    expect(screen.queryByTestId('comic-preview-stage')).toBeNull();
  });

  it('draws a scene that plays a video as the novel, whatever it is set to', () => {
    renderInspector(scene([words('rain', 'Rain falls.'), playingVideo]), 'comic');
    expect(screen.queryByTestId('comic-preview-stage')).toBeNull();
  });

  it('runs the scene in the reader\'s comic view, and closes it', () => {
    renderInspector(scene(), 'comic');

    fireEvent.click(screen.getByTestId('preview-read-as-comic'));

    const stage = screen.getByTestId('comic-read-stage');
    expect(stage.querySelector('iframe[title="Comic"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go back to the previous line' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('comic-read-stage')).toBeNull();
  });

  it('offers no reading while the Preview shows the novel', () => {
    renderInspector(scene());
    expect(screen.queryByTestId('preview-read-as-comic')).toBeNull();
  });
});
