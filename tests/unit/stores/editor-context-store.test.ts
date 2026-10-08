import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';
import { selectVisibleEditorSelection, useEditorContextStore } from '@/stores/editor-context-store';

function state(seq: number, text = `вибір ${seq}`): VNPlateSelectionState {
  return {
    seq,
    collapsed: false,
    text,
    textLength: text.length,
    truncated: false,
    before: '',
    after: '',
    crossesChip: false,
    blocks: [{ id: 'block_1', kind: 'text', quote: text, occurrence: 0 }],
  };
}

describe('editor context store', () => {
  const store = () => useEditorContextStore.getState();

  beforeEach(() => {
    store().clearStory('story_1');
    store().clearStory('story_2');
  });

  it('keeps the latest selection together with the scene it came from', () => {
    store().reportSelection('story_1', 'scene_1', state(1));
    store().reportSelection('story_1', 'scene_2', state(1, 'інша сцена'));

    expect(store().selection).toMatchObject({ storyId: 'story_1', sceneId: 'scene_2', text: 'інша сцена' });
  });

  it('drops a message that arrives after a newer one from the same frame', () => {
    store().reportSelection('story_1', 'scene_1', state(5, 'нове'));
    store().reportSelection('story_1', 'scene_1', state(4, 'старе'));

    expect(store().selection?.text).toBe('нове');
  });

  it('does not let one frame’s counter silence another frame', () => {
    store().reportSelection('story_1', 'scene_1', state(9));
    store().reportSelection('story_1', 'scene_2', state(1, 'друга сцена'));

    expect(store().selection?.text).toBe('друга сцена');
  });

  it('forgets a frame that went away, and accepts its replacement from one again', () => {
    store().reportSelection('story_1', 'scene_1', state(7));
    store().clearFrame('story_1', 'scene_1');

    expect(store().selection).toBeNull();

    store().reportSelection('story_1', 'scene_1', state(1, 'після перемонтування'));
    expect(store().selection?.text).toBe('після перемонтування');
  });

  it('leaves another frame’s selection alone when a frame goes away', () => {
    store().reportSelection('story_1', 'scene_1', state(1));
    store().reportSelection('story_1', 'scene_2', state(1, 'лишається'));
    store().clearFrame('story_1', 'scene_1');

    expect(store().selection?.text).toBe('лишається');
  });

  it('clears only the story that was closed', () => {
    store().reportSelection('story_2', 'scene_1', state(1, 'чужа історія'));
    store().clearStory('story_1');

    expect(store().selection?.text).toBe('чужа історія');

    store().clearStory('story_2');
    expect(store().selection).toBeNull();
  });

  it('hides a dismissed selection until the author selects something else', () => {
    store().reportSelection('story_1', 'scene_1', state(1));
    store().dismissSelection();

    expect(selectVisibleEditorSelection(store())).toBeNull();
    expect(store().selection).not.toBeNull();

    store().reportSelection('story_1', 'scene_1', state(2, 'новий вибір'));
    expect(selectVisibleEditorSelection(store())?.text).toBe('новий вибір');
  });
});
