/**
 * The author's ✂ and × (docs/plans/COMIC-STAGE-3-PLAN.md, 3.4): "a new panel
 * starts here" and "this panel joins the one before", pressed on a sentence
 * in the Preview.
 *
 * A press asks for an outcome — the sentence begins a panel, or it does not —
 * and gets it with as few marks as it takes. A mark of the other kind on the
 * sentence goes first: × on a boundary a ✂ made takes the ✂ away rather than
 * stacking a × on it, and the other way round. Only when the automatic panels
 * would still not give the outcome is a mark of the pressed kind added. So a
 * mark is never kept where it changes nothing, and the next press never
 * merely clears one.
 *
 * Plain TypeScript, no React and no store, like the rest of `src/lib/comic/`.
 */
import { addressSentences, resolveComicAnchor, sentencePrint, type AddressedSentence, type ComicAnchor } from '@/lib/comic/comic-anchors';
import { buildAuthorComicPlan } from '@/lib/comic/comic-layout';
import { comicEditsOf, withComicEdits } from '@/lib/comic/comic-settings';
import type { ComicAnchoredSetting, SceneComicSettings, TimelineStep } from '@/lib/engine/types';

/** Whether a panel of the author's plan begins with the sentence at `anchor`. */
export function beginsPanel(timeline: readonly TimelineStep[], settings: SceneComicSettings | undefined, anchor: ComicAnchor): boolean {
  return buildAuthorComicPlan(timeline, settings).panels.some((panel) => panel.anchor === anchor);
}

/** A list without the marks that act on the sentence at `anchor` now. */
function withoutMarksAt(
  list: readonly ComicAnchoredSetting[] | undefined,
  sentences: AddressedSentence[],
  anchor: ComicAnchor,
): ComicAnchoredSetting[] {
  return (list ?? []).filter((mark) => {
    const found = resolveComicAnchor(mark, sentences);
    return found.status === 'detached' || found.anchor !== anchor;
  });
}

/**
 * The settings with the sentence at `anchor` made to begin a panel (`begins`:
 * the ✂) or to go on in the panel before (the ×). The settings come back as
 * they are when the scene has no such sentence, or it is already so.
 */
export function withPanelStartAt(
  settings: SceneComicSettings | undefined,
  timeline: readonly TimelineStep[],
  anchor: ComicAnchor,
  begins: boolean,
): SceneComicSettings | undefined {
  const sentences = addressSentences([...timeline]);
  const sentence = sentences.find((candidate) => candidate.anchor === anchor);
  if (!sentence || beginsPanel(timeline, settings, anchor) === begins) return settings;

  const edits = comicEditsOf(settings);
  const breaks = withoutMarksAt(edits.breaks, sentences, anchor);
  const merges = withoutMarksAt(edits.merges, sentences, anchor);
  const cleared = withComicEdits(settings, { ...edits, breaks, merges });
  if (beginsPanel(timeline, cleared, anchor) === begins) return cleared;

  const mark: ComicAnchoredSetting = { anchor, print: sentencePrint(sentence.text) };
  return withComicEdits(settings, begins
    ? { ...edits, breaks: [...breaks, mark], merges }
    : { ...edits, breaks, merges: [...merges, mark] });
}
