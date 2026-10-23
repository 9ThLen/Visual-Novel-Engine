/**
 * The words of a scene as the comic sets them: stage 2 of the comic plan
 * (docs/plans/COMIC-MODE-PLAN.md, section 4.1).
 *
 * A `text` step is narration, and every sentence of it is a caption, so a long
 * paragraph never becomes one wall of words and every caption is a sentence a
 * setting can be fastened to. A `dialogue` step is speech, and every line of it
 * is a bubble with its speaker and sprite. Nothing else is speech: words in
 * quotes inside narration stay narration, since only the author can say who
 * speaks. Every bubble is an ordinary one until the author picks another kind
 * (stage 3).
 *
 * An inline chip — an effect, a sound or music set inside a line — goes with
 * the sentence that follows it in its block, because that is when it runs in
 * the novel: on the tap that brings the sentence up. Rain, snow or fog right
 * after words is the exception, since the novel starts it while those words
 * are still on screen; it goes with the sentence before it. So does a chip at
 * the end of its block, and a chip in a block with no words goes with none.
 * A standalone effect, sound or music block is not a chip: it
 * can carry a condition, so only the reader knows whether it ran, and what it
 * left on screen reaches the comic through the picture (comic-layout.ts).
 *
 * Every element is addressed as `addressSentences` addresses it, so its anchor
 * is the key its comic settings are kept under (comic-anchors.ts).
 *
 * Plain TypeScript, no React and no store, like the rest of `src/lib/comic/`.
 */
import { addressSentences, splitSentences, type ComicAnchor } from '@/lib/comic/comic-anchors';
import { isBlockingEffectType } from '@/lib/engine/effect-duration';
import type {
  DialogueBlockData,
  EffectBlockData,
  EffectType,
  MusicBlockData,
  SoundBlockData,
  TimelineStep,
} from '@/lib/engine/types';

/** One sentence of an element, with its address. */
export interface ComicSentence {
  anchor: ComicAnchor;
  text: string;
}

/** An inline chip, as the element it goes with carries it. */
export type ComicCue =
  | {
      kind: 'effect';
      stepId: string;
      effectType: EffectType;
      target: EffectBlockData['target'];
      intensity: number;
      characterId?: string;
    }
  | { kind: 'sound'; stepId: string; mode: SoundBlockData['mode']; assetId: string | null }
  | { kind: 'music'; stepId: string; mode: MusicBlockData['mode']; assetId: string | null };

interface ComicElementBase {
  /** Its first sentence's address: the element's key, and where its settings are fastened. */
  anchor: ComicAnchor;
  /** The step the words are from. */
  stepId: string;
  /** The words as the renderer sets them: plain text, its sentences joined by a space. */
  text: string;
  sentences: ComicSentence[];
  /** The inline chips that run as this element comes up, in the order they stand. */
  cues: ComicCue[];
}

export interface ComicCaption extends ComicElementBase {
  kind: 'caption';
}

/** Only `'normal'` until the author can pick a thought, a shout or a whisper (stage 3). */
export type ComicBubbleStyle = 'normal';

export interface ComicBubble extends ComicElementBase {
  kind: 'bubble';
  style: ComicBubbleStyle;
  /** The dialogue line the bubble is. */
  entryId: string;
  characterId: string;
  /** The name the line was written under, when it was; otherwise the character's own. */
  speakerName?: string;
  spriteId: string;
}

export type ComicElement = ComicCaption | ComicBubble;

/** The chips of a scene by the sentence each goes with. */
export type ComicCues = ReadonlyMap<ComicAnchor, readonly ComicCue[]>;

const NO_CUES: ComicCues = new Map();

/** An effect, a sound or music that opening a scene would put inline: switched on, with no condition. */
function isInlineChip(step: TimelineStep): boolean {
  return (step.blockType === 'effect' || step.blockType === 'sound' || step.blockType === 'music')
    && step.enabled !== false
    && (step.conditions ?? []).length === 0;
}

function cueOf(step: TimelineStep): ComicCue | null {
  if (!isInlineChip(step)) return null;
  if (step.blockType === 'effect') {
    const data = step.data as EffectBlockData;
    return {
      kind: 'effect',
      stepId: step.id,
      effectType: data.effectType,
      target: data.target,
      intensity: data.intensity,
      ...(data.characterId ? { characterId: data.characterId } : {}),
    };
  }
  const data = step.data as SoundBlockData | MusicBlockData;
  return { kind: step.blockType as 'sound' | 'music', stepId: step.id, mode: data.mode, assetId: data.assetId ?? null };
}

/**
 * Which line of the scene a step is a piece of, for finding a chip's sentence:
 * the block a part was saved from, or — for steps saved before blocks were
 * remembered — the run of text and chips that opening folds into one line
 * (`legacyLineAt` in document-scene.ts). Null for a step that is a block of
 * its own.
 */
function lineOf(step: TimelineStep): string | null {
  if (step.originBlockId !== undefined && step.originPart !== undefined) return `block:${step.originBlockId}`;
  if (!step.originBlockId && (step.blockType === 'text' || isInlineChip(step))) return 'legacy';
  return null;
}

function linesOf(timeline: readonly TimelineStep[]): TimelineStep[][] {
  const lines: TimelineStep[][] = [];
  let line: TimelineStep[] = [];
  let key: string | null = null;
  for (const step of timeline) {
    const next = lineOf(step);
    if (next === null || next !== key) {
      if (line.length) lines.push(line);
      line = [];
    }
    key = next;
    if (next !== null) line.push(step);
  }
  if (line.length) lines.push(line);
  return lines;
}

function isBlockingEffectChip(step: TimelineStep): boolean {
  return step.blockType === 'effect' && isInlineChip(step) && isBlockingEffectType((step.data as EffectBlockData).effectType);
}

/**
 * Whether the novel sets a chip up ahead, while the words before it are still
 * on screen: rain, snow or fog standing straight after words, with nothing but
 * more of the same between (useSceneExecutor.ts).
 */
function isSetUpAhead(line: readonly TimelineStep[], index: number): boolean {
  if (!isBlockingEffectChip(line[index])) return false;
  for (let back = index - 1; back >= 0; back -= 1) {
    if (isBlockingEffectChip(line[back])) continue;
    return line[back].blockType === 'text' || line[back].blockType === 'dialogue';
  }
  return false;
}

/**
 * Every inline chip of a scene, by the sentence it goes with: the first
 * sentence after it in its block, or, when nothing follows, the last one
 * before it. Rain, snow or fog the novel sets up ahead goes with the sentence
 * before it, which is on screen when it starts.
 */
export function comicCues(timeline: readonly TimelineStep[]): ComicCues {
  const cues = new Map<ComicAnchor, ComicCue[]>();
  for (const line of linesOf(timeline)) {
    // A line switched off is never read, so no chip can go with it.
    const sentences = line.map((step) => (step.enabled === false ? [] : addressSentences([step])));
    line.forEach((step, index) => {
      const cue = cueOf(step);
      if (!cue) return;
      const after = sentences.slice(index + 1).find((own) => own.length > 0);
      const before = sentences.slice(0, index).reverse().find((own) => own.length > 0);
      const lastBefore = before?.[before.length - 1].anchor;
      const anchor = isSetUpAhead(line, index) ? lastBefore ?? after?.[0].anchor : after?.[0].anchor ?? lastBefore;
      if (!anchor) return;
      cues.set(anchor, [...(cues.get(anchor) ?? []), cue]);
    });
  }
  return cues;
}

function element(
  sentences: ComicSentence[],
  stepId: string,
  cues: ComicCues,
): ComicElementBase {
  return {
    anchor: sentences[0].anchor,
    stepId,
    text: sentences.map((sentence) => sentence.text).join(' '),
    sentences,
    cues: sentences.flatMap((sentence) => cues.get(sentence.anchor) ?? []),
  };
}

/**
 * The elements a step puts on the page, in reading order: a caption for every
 * sentence of a `text` step, a bubble for every line of a `dialogue` step with
 * any words, and nothing for any other step. `cues` comes from `comicCues` of
 * the scene the step is in.
 */
export function comicStepElements(step: TimelineStep, cues: ComicCues = NO_CUES): ComicElement[] {
  if (step.blockType === 'text') {
    return addressSentences([step]).map((sentence) => ({
      kind: 'caption',
      ...element([{ anchor: sentence.anchor, text: sentence.text }], step.id, cues),
    }));
  }
  if (step.blockType !== 'dialogue') return [];
  const entries = (step.data as DialogueBlockData).entries;
  if (!Array.isArray(entries)) return [];

  // Sentences are numbered on from one line to the next, so each line takes
  // its own share of the step's addresses, counted the same way.
  const addressed = addressSentences([step]);
  const bubbles: ComicBubble[] = [];
  let next = 0;
  for (const entry of entries) {
    const count = splitSentences(entry.text ?? '').length;
    const own = addressed.slice(next, next + count).map(({ anchor, text }) => ({ anchor, text }));
    next += count;
    if (!own.length) continue;
    bubbles.push({
      kind: 'bubble',
      style: 'normal',
      ...element(own, step.id, cues),
      entryId: entry.id,
      characterId: entry.characterId ?? '',
      ...(entry.speakerName ? { speakerName: entry.speakerName } : {}),
      spriteId: entry.spriteId ?? '',
    });
  }
  return bubbles;
}

/** Every element of a scene, in the order its steps stand. */
export function comicElements(timeline: readonly TimelineStep[]): ComicElement[] {
  const cues = comicCues(timeline);
  return timeline.flatMap((step) => comicStepElements(step, cues));
}
