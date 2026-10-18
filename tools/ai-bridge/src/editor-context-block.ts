import type { AiEditorContext } from '../../../src/lib/ai/editor-context';

/**
 * How the editor context reaches the model: as a block after the user's own
 * words, in the one place every provider reads from.
 *
 * The context carries text the author selected, and that text is data. Angle
 * brackets inside the JSON are written as escapes so nothing in a selection can
 * close the block early or open a block of its own; the JSON still parses to
 * the same value.
 */
export function formatEditorContextBlock(context: AiEditorContext): string {
  const json = JSON.stringify(context).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `<editor_context>\n${json}\n</editor_context>`;
}

export function appendEditorContext(text: string, context: AiEditorContext): string {
  const block = formatEditorContextBlock(context);
  return text.trim() ? `${text}\n\n${block}` : block;
}
