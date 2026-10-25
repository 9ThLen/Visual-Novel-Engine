/**
 * The Inspector's "Panel" section (comic stage 3.3): the author's edits of the
 * panel the Preview shows, written to the scene's comic settings — picked by
 * the stepper, by the caret in the text, or by a click in the Preview.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { DocumentInspectorPanel, type ComicSettingsUpdate } from '@/components/document-editor/DocumentInspectorPanel';
import { sentencePrint } from '@/lib/comic/comic-anchors';
import { COMIC_FRAME_SOURCE } from '@/lib/comic/comic-frame-protocol';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { SceneComicSettings } from '@/lib/engine/types';
import { useEditorContextStore } from '@/stores/editor-context-store';

// Two sentences of narration, each a panel, then a line of two sentences.
const scene: DocumentScene = {
  sceneId: 'scene-1',
  sceneName: 'Storm',
  blocks: [
    { id: 'rain', kind: 'text', content: 'Rain falls. Wind howls.' },
    { id: 'line', kind: 'dialogue', speakerName: 'Ann', characterId: 'ann', spriteId: 'ann-smile', text: 'Who is there? Answer me!' },
  ],
};

afterEach(() => useEditorContextStore.getState().clearStory('story-1'));

/** The Inspector over a scene read as a comic, with its settings kept as the store would keep them. */
function renderInspector(initial: SceneComicSettings = {}) {
  let settings: SceneComicSettings | undefined = { presentation: 'comic', ...initial };
  const updates = vi.fn((update: ComicSettingsUpdate) => {
    settings = update(settings);
  });
  const inspector = () => (
    <DocumentInspectorPanel
      scene={scene}
      storyId="story-1"
      characters={[]}
      storyScenes={[]}
      comicSettings={settings}
      onUpdateComicSettings={updates}
    />
  );
  const view = render(inspector());
  /** A press, then the Inspector drawn again with the settings it wrote. */
  const press = (testId: string, init?: MouseEventInit) => {
    fireEvent.click(screen.getByTestId(testId), init);
    view.rerender(inspector());
  };
  return { view, press, updates, settings: () => settings, redraw: () => view.rerender(inspector()) };
}

const title = () => screen.getByTestId('comic-panel-section').querySelector('div')?.textContent;
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next panel' }));

describe('the Panel section', () => {
  it('edits the panel the Preview shows: its shot, size and focus', () => {
    const inspector = renderInspector();
    expect(title()).toContain('Panel 1 of 3');

    inspector.press('comic-shot-close');
    inspector.press('comic-size-half');
    // The middle of the 176 × 110 picture.
    inspector.press('comic-focus-picture', { clientX: 88, clientY: 55 });

    expect(inspector.settings()).toEqual({
      presentation: 'comic',
      panels: [{ anchor: 'rain/p0/s0', print: sentencePrint('Rain falls.'), shot: 'close', size: 'half', focus: { x: 0.5, y: 0.5 } }],
    });
    expect(screen.getByTestId('comic-shot-close-on')).toBeTruthy();
    expect(screen.getByTestId('comic-size-half-on')).toBeTruthy();

    inspector.press('comic-shot-auto');
    inspector.press('comic-focus-auto');
    expect(inspector.settings()?.panels).toEqual([{ anchor: 'rain/p0/s0', print: sentencePrint('Rain falls.'), size: 'half' }]);
  });

  it('gives each line its kind of words and its tail, and the kind\'s own way back as no edit', () => {
    const inspector = renderInspector();
    next();
    next();
    expect(title()).toContain('Panel 3 of 3');

    inspector.press('comic-style-line/p0/s0-shout');
    inspector.press('comic-tail-line/p0/s0-right');
    expect(inspector.settings()?.elements).toEqual([
      { anchor: 'line/p0/s0', print: sentencePrint('Who is there?'), style: 'shout', tail: 'right' },
    ]);

    inspector.press('comic-style-line/p0/s0-speech');
    expect(inspector.settings()?.elements).toEqual([{ anchor: 'line/p0/s0', print: sentencePrint('Who is there?'), tail: 'right' }]);

    // A caption box has no tail to turn.
    inspector.press('comic-style-line/p0/s0-caption');
    expect(screen.queryByTestId('comic-tail-line/p0/s0-auto')).toBeNull();
  });

  it('undoes its own edits one by one, and puts the automatic panel back', () => {
    const inspector = renderInspector();
    expect(screen.getByTestId('comic-panel-undo').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('comic-panel-restore').hasAttribute('disabled')).toBe(true);

    inspector.press('comic-shot-wide');
    inspector.press('comic-size-full');
    inspector.press('comic-panel-undo');
    expect(inspector.settings()?.panels).toEqual([{ anchor: 'rain/p0/s0', print: sentencePrint('Rain falls.'), shot: 'wide' }]);

    inspector.press('comic-panel-restore');
    expect(inspector.settings()).toEqual({ presentation: 'comic' });
    // Putting it back is an edit too, and can be undone.
    inspector.press('comic-panel-undo');
    expect(inspector.settings()?.panels).toEqual([{ anchor: 'rain/p0/s0', print: sentencePrint('Rain falls.'), shot: 'wide' }]);
  });

  it('follows the caret to the panel of its sentence', () => {
    renderInspector();
    act(() => {
      useEditorContextStore.getState().reportSelection('story-1', 'scene-1', {
        seq: 1,
        collapsed: true,
        text: '',
        textLength: 0,
        truncated: false,
        before: 'Rain falls. Wi',
        after: 'nd howls.',
        crossesChip: false,
        blocks: [{ id: 'rain', kind: 'text', quote: '', occurrence: 0 }],
      });
    });
    expect(title()).toContain('Panel 2 of 3');
  });

  it('picks the panel the author clicks in the Preview', () => {
    renderInspector();
    next();
    next();
    const iframe = screen.getByTestId('comic-preview-stage').querySelector('iframe')!;
    const token = JSON.parse(/window\.__VNE_COMIC_BOOT = (\{.*?\});/.exec(iframe.getAttribute('srcdoc') ?? '')?.[1] ?? '{}').token;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { source: COMIC_FRAME_SOURCE, token, type: 'tap', panelId: 'rain/p0/s0' },
        origin: window.location.origin,
        source: iframe.contentWindow,
      }));
    });

    expect(title()).toContain('Panel 1 of 3');
  });

  it('starts a panel at a ✂ pressed in the Preview, shows that panel, and joins it back at its ×', () => {
    const inspector = renderInspector();
    next();
    next();
    const iframe = screen.getByTestId('comic-preview-stage').querySelector('iframe')!;
    const token = JSON.parse(/window\.__VNE_COMIC_BOOT = (\{.*?\});/.exec(iframe.getAttribute('srcdoc') ?? '')?.[1] ?? '{}').token;
    const mark = (anchor: string, begins: boolean) => act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { source: COMIC_FRAME_SOURCE, token, type: 'mark', anchor, begins },
        origin: window.location.origin,
        source: iframe.contentWindow,
      }));
    });

    mark('line/p0/s1', true);
    inspector.redraw();
    expect(inspector.settings()).toEqual({ presentation: 'comic', breaks: [{ anchor: 'line/p0/s1', print: sentencePrint('Answer me!') }] });
    expect(title()).toContain('Panel 4 of 4');

    mark('line/p0/s1', false);
    inspector.redraw();
    expect(inspector.settings()).toEqual({ presentation: 'comic' });
    expect(title()).toContain('Panel 3 of 3');

    // A mark is an edit like the others: Undo takes it back.
    inspector.press('comic-panel-undo');
    expect(inspector.settings()?.breaks).toHaveLength(1);
  });

  describe('in Issues', () => {
    const openIssues = () => fireEvent.click(screen.getByText('issues'));

    it('lists an edit whose sentence is gone, and fastens it to the sentence under the caret', () => {
      const inspector = renderInspector({ panels: [{ anchor: 'rain/p0/s0', print: sentencePrint('A sentence nobody wrote.'), shot: 'close' }] });
      openIssues();
      const key = 'panels:rain/p0/s0';
      expect(screen.getByTestId(`comic-issue-${key}`).textContent).toContain('its sentence is gone');
      expect(screen.getByTestId(`comic-issue-fasten-${key}`).hasAttribute('disabled')).toBe(true);

      act(() => {
        useEditorContextStore.getState().reportSelection('story-1', 'scene-1', {
          seq: 1, collapsed: true, text: '', textLength: 0, truncated: false,
          before: 'Who is there? An', after: 'swer me!', crossesChip: false,
          blocks: [{ id: 'line', kind: 'dialogue', quote: '', occurrence: 0 }],
        });
      });
      inspector.press(`comic-issue-fasten-${key}`);

      expect(inspector.settings()?.panels).toEqual([{ anchor: 'line/p0/s1', print: sentencePrint('Answer me!'), shot: 'close' }]);
      expect(screen.queryByTestId('comic-edit-issues')).toBeNull();
    });

    it('lists an edit whose words changed, and takes them as they are now when marked as checked', () => {
      const inspector = renderInspector({ elements: [{ anchor: 'rain/p0/s1', print: sentencePrint('Wind howled.'), style: 'whisper' }] });
      openIssues();
      const key = 'elements:rain/p0/s1';
      expect(screen.getByTestId(`comic-issue-${key}`).textContent).toContain('its words changed');
      expect(screen.getByTestId(`comic-issue-${key}`).textContent).toContain('Now: “Wind howls.”');

      inspector.press(`comic-issue-checked-${key}`);
      expect(inspector.settings()?.elements).toEqual([{ anchor: 'rain/p0/s1', print: sentencePrint('Wind howls.'), style: 'whisper' }]);
      expect(screen.queryByTestId('comic-edit-issues')).toBeNull();
    });

    it('removes an edit, and the removal can be undone', () => {
      const inspector = renderInspector({ breaks: [{ anchor: 'rain/p0/s1', print: sentencePrint('Gone.') }] });
      openIssues();
      inspector.press('comic-issue-remove-breaks:rain/p0/s1');
      expect(inspector.settings()).toEqual({ presentation: 'comic' });
      inspector.press('comic-panel-undo');
      expect(inspector.settings()?.breaks).toHaveLength(1);
    });
  });

  it('is not there when the scene\'s comic settings cannot be written', () => {
    render(<DocumentInspectorPanel scene={scene} storyId="story-1" characters={[]} storyScenes={[]} comicSettings={{ presentation: 'comic' }} />);
    expect(screen.queryByTestId('comic-panel-section')).toBeNull();
  });
});
