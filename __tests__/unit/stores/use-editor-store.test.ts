import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from '@/stores/use-editor-store';

function makeBackgroundStep(id: string) {
  return {
    id,
    blockType: 'background' as const,
    data: {
      assetId: null,
      transition: 'fade' as const,
      duration: 500,
    },
    collapsed: false,
    enabled: true,
  };
}

describe('use-editor-store', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it('inserts a default background when setting an empty scene timeline', () => {
    useEditorStore.getState().setScene('scene-1', 'Scene 1', []);

    const state = useEditorStore.getState();

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0]?.blockType).toBe('background');
  });

  it('does not add a second background block', () => {
    useEditorStore.getState().setScene('scene-1', 'Scene 1', [makeBackgroundStep('bg-1')]);

    useEditorStore.getState().addBlock('background');

    const state = useEditorStore.getState();

    expect(state.timeline.filter((step) => step.blockType === 'background')).toHaveLength(1);
    expect(state.selectedBlockId).toBe('bg-1');
  });

  it('does not remove the only background block', () => {
    useEditorStore.getState().setScene('scene-1', 'Scene 1', [makeBackgroundStep('bg-1')]);

    useEditorStore.getState().removeBlock('bg-1');

    const state = useEditorStore.getState();

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0]?.id).toBe('bg-1');
  });

  it('does not duplicate the background block', () => {
    useEditorStore.getState().setScene('scene-1', 'Scene 1', [makeBackgroundStep('bg-1')]);

    useEditorStore.getState().duplicateBlock('bg-1');

    const state = useEditorStore.getState();

    expect(state.timeline.filter((step) => step.blockType === 'background')).toHaveLength(1);
    expect(state.selectedBlockId).toBe('bg-1');
  });

  it('appends newly added blocks to the end of the timeline', () => {
    useEditorStore.getState().setScene('scene-1', 'Scene 1', [
      makeBackgroundStep('bg-1'),
      {
        id: 'text-1',
        blockType: 'text',
        data: {
          content: 'Intro',
          typewriterSpeed: 0.5,
          anchorTo: 'background',
        },
        collapsed: false,
        enabled: true,
      },
    ]);

    useEditorStore.getState().addBlock('dialogue');

    const state = useEditorStore.getState();

    expect(state.timeline[state.timeline.length - 1]?.blockType).toBe('dialogue');
  });

  it('reorders blocks when moveBlock swaps two positions', () => {
    useEditorStore.getState().setScene('scene-1', 'Scene 1', [
      makeBackgroundStep('bg-1'),
      {
        id: 'text-1',
        blockType: 'text',
        data: {
          content: 'Intro',
          typewriterSpeed: 0.5,
          anchorTo: 'background',
        },
        collapsed: false,
        enabled: true,
      },
      {
        id: 'dialogue-1',
        blockType: 'dialogue',
        data: {
          entries: [],
          currentEntryIndex: 0,
        },
        collapsed: false,
        enabled: true,
      },
    ]);

    useEditorStore.getState().moveBlock(1, 2);

    const state = useEditorStore.getState();

    expect(state.timeline.map((step) => step.id)).toEqual(['bg-1', 'dialogue-1', 'text-1']);
  });
});
