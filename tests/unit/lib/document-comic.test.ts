import { documentSceneNovelOnly } from '@/lib/document-editor/document-comic';
import type { DocumentBlock } from '@/lib/document-editor/types';
import type { TimelineStep } from '@/lib/engine/types';

function technical(blockType: TimelineStep['blockType'], data: Record<string, unknown>, enabled = true): DocumentBlock {
  const step = { id: `step-${blockType}`, blockType, data, collapsed: false, enabled } as unknown as TimelineStep;
  return { id: step.id, kind: 'technical', commandId: 'video', blockType, label: '', summary: '', step } as DocumentBlock;
}

const words: DocumentBlock = { id: 'words', kind: 'text', content: 'Rain.' };

describe('what keeps a scene being written a novel', () => {
  it('is nothing in a page of words', () => {
    expect(documentSceneNovelOnly({ blocks: [words] })).toBeNull();
  });

  it('is a video block that plays, or an interactive object', () => {
    expect(documentSceneNovelOnly({ blocks: [words, technical('video', { mode: 'play', layer: 'cutscene' })] })).toBe('video');
    expect(documentSceneNovelOnly({ blocks: [technical('interactive_object', { objectId: 'door' })] })).toBe('interactive_object');
  });

  it('is not a video block that stops one, or a switched-off block', () => {
    expect(documentSceneNovelOnly({ blocks: [technical('video', { mode: 'stop', layer: 'cutscene' })] })).toBeNull();
    expect(documentSceneNovelOnly({ blocks: [technical('interactive_object', { objectId: 'door' }, false)] })).toBeNull();
  });
});
