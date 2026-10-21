/**
 * Where a comic setting is fastened to the story's text, so that it outlives
 * a save, a reopening and edits to the words around it.
 *
 * A step id does not do: a block typed in this session, and every run of text
 * beside an inline chip, is saved as new steps each time. The block a step was
 * saved from keeps its id (`TimelineStep.originBlockId`), so a sentence is
 * addressed by that block, the part of the block it is in and its number among
 * the part's sentences — a string, so it can be a key. The numbers are places
 * and move with edits, so every anchored setting also keeps a print of the
 * sentence's words, and the print is checked every time, not only when the key
 * is gone. Nothing is ever fastened anew by guesswork.
 *
 * Plain TypeScript, no React and no store: the editor gives it the timeline its
 * converter makes, the reader and the player the stored one.
 */
import type { DialogueBlockData, TextBlockData, TimelineStep } from '@/lib/engine/types';
import { stripRichText } from '@/lib/rich-text';

/** `"<blockId>/p<part>/s<sentence>"` */
export type ComicAnchor = string;

export interface ComicAnchored {
  anchor: ComicAnchor;
  /** The words of the sentence it was fastened to, as `sentencePrint` gives them. */
  print?: string;
}

export interface AddressedSentence {
  anchor: ComicAnchor;
  blockId: string;
  part: number;
  sentence: number;
  text: string;
  print: string;
}

export type AnchorResolution =
  /** The sentence is where it was, with the same words. */
  | { status: 'bound'; anchor: ComicAnchor }
  /** The same words are now elsewhere — once in the block, or once in the scene. */
  | { status: 'moved'; anchor: ComicAnchor; from: ComicAnchor }
  /** The words at the place were edited a little and nothing else resembles them: kept, with a note to check. */
  | { status: 'changed'; anchor: ComicAnchor }
  /** No sentence can be told to be the one: the setting asks to be fastened again or removed. */
  | { status: 'detached' };

export function comicAnchor(blockId: string, part: number, sentence: number): ComicAnchor {
  return `${blockId}/p${part}/s${sentence}`;
}

export function parseComicAnchor(anchor: ComicAnchor): { blockId: string; part: number; sentence: number } | null {
  const match = /^(.+)\/p(\d+)\/s(\d+)$/.exec(anchor);
  return match ? { blockId: match[1], part: Number(match[2]), sentence: Number(match[3]) } : null;
}

const SENTENCE_END = '.!?…';
const CLOSERS = '.!?…"»”’)]';

/**
 * The sentences of a run of text, as the comic counts them: a sentence ends at
 * `.`, `!`, `?` or `…` (with any quotes or brackets that close it) before a
 * space or the end, and at every line break. The same text always splits the
 * same way; that is what the numbers in an anchor rely on.
 */
export function splitSentences(text: string): string[] {
  const plain = stripRichText(text);
  const sentences: string[] = [];
  let current = '';
  const close = () => {
    const sentence = current.trim();
    if (sentence) sentences.push(sentence);
    current = '';
  };
  for (let index = 0; index < plain.length; index += 1) {
    const char = plain[index];
    if (char === '\n') {
      close();
      continue;
    }
    current += char;
    if (!SENTENCE_END.includes(char)) continue;
    while (index + 1 < plain.length && CLOSERS.includes(plain[index + 1])) {
      index += 1;
      current += plain[index];
    }
    if (index + 1 >= plain.length || /\s/.test(plain[index + 1])) close();
  }
  close();
  return sentences;
}

/** The words a sentence is known by: case, spacing, markup and the kind of quote or apostrophe left out. */
export function sentencePrint(sentence: string): string {
  return stripRichText(sentence)
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function textOf(step: TimelineStep): string | null {
  if (step.blockType === 'text') return (step.data as TextBlockData).content ?? '';
  if (step.blockType === 'dialogue') return (step.data as DialogueBlockData).entries[0]?.text ?? '';
  return null;
}

/**
 * Every sentence of a scene's words, addressed. A step that does not say which
 * block it was saved from is its own block, under its own id — which is the
 * id that block opens under.
 */
export function addressSentences(timeline: TimelineStep[]): AddressedSentence[] {
  const addressed: AddressedSentence[] = [];
  for (const step of timeline) {
    const text = textOf(step);
    if (text === null) continue;
    const blockId = step.originBlockId ?? step.id;
    const part = step.originPart ?? 0;
    splitSentences(text).forEach((sentence, index) => {
      addressed.push({
        anchor: comicAnchor(blockId, part, index),
        blockId,
        part,
        sentence: index,
        text: sentence,
        print: sentencePrint(sentence),
      });
    });
  }
  return addressed;
}

/** How alike two prints are, from 0 to 1: one less the share of characters an edit had to change. */
export function printSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

/** Alike enough that a corrected typo, or a word changed, does not cut a setting loose. */
export const SIMILAR_PRINT = 0.75;

/**
 * Finds the sentence an anchored setting belongs to now.
 *
 * 1. The place still holds the same words → bound.
 * 2. The words are elsewhere: exactly once in the same block, or, failing
 *    that, exactly once in the scene → moved there.
 * 3. They are nowhere, but the place holds words very like them and nothing
 *    else does → kept there, marked as changed.
 * 4. Anything else — two places with the words, nothing alike — → detached.
 *
 * A setting with no print can only be kept by its place.
 */
export function resolveComicAnchor(anchored: ComicAnchored, sentences: AddressedSentence[]): AnchorResolution {
  const at = sentences.find((sentence) => sentence.anchor === anchored.anchor);
  const print = anchored.print;
  if (print === undefined) return at ? { status: 'bound', anchor: at.anchor } : { status: 'detached' };
  if (at && at.print === print) return { status: 'bound', anchor: at.anchor };

  const blockId = parseComicAnchor(anchored.anchor)?.blockId;
  const sameWords = sentences.filter((sentence) => sentence.print === print);
  const inBlock = sameWords.filter((sentence) => sentence.blockId === blockId);
  if (inBlock.length === 1) return { status: 'moved', anchor: inBlock[0].anchor, from: anchored.anchor };
  if (inBlock.length > 1) return { status: 'detached' };
  if (sameWords.length === 1) return { status: 'moved', anchor: sameWords[0].anchor, from: anchored.anchor };
  if (sameWords.length > 1) return { status: 'detached' };

  if (at && printSimilarity(at.print, print) >= SIMILAR_PRINT) {
    const alike = sentences.filter((sentence) => sentence !== at && printSimilarity(sentence.print, print) >= SIMILAR_PRINT);
    if (!alike.length) return { status: 'changed', anchor: at.anchor };
  }
  return { status: 'detached' };
}
