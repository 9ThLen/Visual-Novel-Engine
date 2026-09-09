/**
 * The editor exit is deterministic by construction.
 *
 * The bug it replaces: scene navigation pushes `/document-editor` entries, so
 * `router.back()` retraced scenes one at a time — and an author looping between
 * two of them never reached the story hub.
 */
import { exitEditorToStoryHome } from '@/lib/document-editor/editor-exit';

describe('exitEditorToStoryHome', () => {
  it('pops to the story hub of the story being edited', () => {
    const dismissTo = vi.fn();

    exitEditorToStoryHome({ dismissTo }, 'story-1');

    expect(dismissTo).toHaveBeenCalledTimes(1);
    expect(dismissTo).toHaveBeenCalledWith({
      pathname: '/story-home',
      params: { storyId: 'story-1' },
    });
  });

  it('does not depend on how deep the editor history is', () => {
    const first = vi.fn();
    const second = vi.fn();

    exitEditorToStoryHome({ dismissTo: first }, 'story-1');
    exitEditorToStoryHome({ dismissTo: second }, 'story-1');

    expect(first.mock.calls).toEqual(second.mock.calls);
  });
});
