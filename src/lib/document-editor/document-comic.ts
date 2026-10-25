/**
 * What the editor knows of a scene's comic reading from the document it has
 * open (docs/plans/COMIC-MODE-PLAN.md, section 9.4). The setting itself lives
 * on the scene record; what keeps a scene a novel is in its steps, which the
 * document holds as it is being written.
 */
import { addressSentences, type ComicAnchor } from '@/lib/comic/comic-anchors';
import { sceneComicCapabilities, type NovelOnlyReason } from '@/lib/comic/comic-presentation';
import type { DialogueBlockData, TextBlockData, TimelineStep } from '@/lib/engine/types';
import { stripRichText } from '@/lib/rich-text';
import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';

import type { DocumentScene } from './types';

/**
 * Why the scene can only be read as the novel, or null. Video and interactive
 * objects are technical blocks, so those are the steps that count.
 */
export function documentSceneNovelOnly(scene: Pick<DocumentScene, 'blocks'>): NovelOnlyReason | null {
  return sceneComicCapabilities(scene.blocks.flatMap((block) => (block.kind === 'technical' ? [block.step] : []))).novelOnly;
}

/**
 * Words as the editor's frame reads them out of its page: markup gone,
 * no-break spaces plain, and no line breaks \u2014 the page draws a break as an
 * element with no text, so what the frame tells of a selection has none.
 */
function asFrameReads(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/[\r\n]/g, '');
}

/** A step's words as the frame reads them. */
function visible(text: string): string {
  return asFrameReads(stripRichText(text));
}

function wordsOf(step: TimelineStep): string {
  if (step.blockType === 'text') return visible((step.data as TextBlockData).content ?? '');
  if (step.blockType === 'dialogue') return (step.data as DialogueBlockData).entries.map((entry) => visible(entry.text ?? '')).join('');
  return '';
}

/**
 * Where in `text` the selection starts. The frame says what stood before it
 * and after it in its block (each cut to 300 characters, and running across
 * the block's other parts), and what it holds of this part. Of the places
 * that agree with all three, the one with the most of `before` behind it.
 */
function selectionStartIn(text: string, before: string, quote: string, after: string): number | null {
  let best: number | null = null;
  let bestBehind = -1;
  for (let at = 0; at <= text.length; at += 1) {
    if (!text.startsWith(quote, at)) continue;
    const behind = Math.min(at, before.length);
    if (behind <= bestBehind || !before.endsWith(text.slice(at - behind, at))) continue;
    const end = at + quote.length;
    if (!after.startsWith(text.slice(end, end + after.length))) continue;
    best = at;
    bestBehind = behind;
  }
  return best;
}

/**
 * The anchor of the sentence the author's caret is in, or where their
 * selection starts: the sentence a panel or a line under the caret is
 * fastened by. Null when the selection is in no words of the scene — a
 * technical block, a choice — or its words cannot be found in `timeline`, the
 * document's own conversion.
 */
export function selectionComicAnchor(
  selection: Pick<VNPlateSelectionState, 'blocks' | 'before' | 'after'>,
  timeline: TimelineStep[],
): ComicAnchor | null {
  const block = selection.blocks[0];
  if (!block || (block.kind !== 'text' && block.kind !== 'dialogue')) return null;
  // A block with inline chips names the part the selection starts in; one without has one part.
  const part = block.parts?.[0]?.index ?? 0;
  const quote = block.parts?.[0]?.quote ?? block.quote;
  const steps = timeline.filter((step) => (step.originBlockId ?? step.id) === block.id && (step.originPart ?? 0) === part);
  const text = steps.map(wordsOf).join('');
  const sentences = addressSentences(steps);
  if (!sentences.length) return null;

  // Where the frame's words cannot be found in the scene's (a report from
  // before an edit reached the document), no sentence is better than a guess.
  const at = selectionStartIn(text, asFrameReads(selection.before), asFrameReads(quote), asFrameReads(selection.after));
  if (at === null) return null;
  let found = sentences[0];
  let from = 0;
  for (const sentence of sentences) {
    const start = text.indexOf(sentence.text, from);
    if (start < 0) continue;
    if (start > at) break;
    found = sentence;
    from = start + sentence.text.length;
  }
  return found.anchor;
}
