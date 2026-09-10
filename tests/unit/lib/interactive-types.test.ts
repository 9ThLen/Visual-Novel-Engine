import { resolveInteractiveDialogueAction } from '@/lib/interactive-types';

describe('resolveInteractiveDialogueAction', () => {
  it('turns a Character: line into a linked dialogue action', () => {
    expect(resolveInteractiveDialogueAction({
      type: 'dialogue',
      text: 'Маша: Привіт!',
      characterId: 'char_masha',
    })).toEqual({
      type: 'dialogue',
      text: 'Привіт!',
      speaker: 'Маша',
      characterId: 'char_masha',
    });
  });

  it('keeps URLs and narration unchanged', () => {
    expect(resolveInteractiveDialogueAction({
      type: 'dialogue',
      text: 'https://example.com',
    })).toEqual({ type: 'dialogue', text: 'https://example.com' });
    expect(resolveInteractiveDialogueAction({
      type: 'dialogue',
      text: 'The sign is locked.',
    })).toEqual({ type: 'dialogue', text: 'The sign is locked.' });
  });
});
