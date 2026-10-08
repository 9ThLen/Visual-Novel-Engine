/**
 * Turns a selection captured in the editor frame into step addresses the
 * assistant can act on.
 *
 * A selection is known by the frame's own block ids and part positions, while
 * a patch needs step ids — and those are minted on save. The only code that
 * knows which block became which step is the document converter, so the
 * captured document is converted again here and its output is laid over the
 * stored timeline position by position. The pairing is trusted only when the
 * two line up exactly; anything else falls back to finding the quote, which is
 * never reported as `exact`.
 */
import type { Character } from '@/lib/character-types';
import { documentSceneToTimelineWithOrigins } from '@/lib/document-editor/document-scene';
import type { DocumentBlockKind, DocumentScene } from '@/lib/document-editor/types';
import type { DialogueBlockData, SceneRecord, TextBlockData, TimelineStep } from '@/lib/engine/types';
import { stripRichText } from '@/lib/rich-text';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateSelectionBlock, VNPlateSelectionState } from '@/lib/vn-plate-editor/types';
import {
  AI_EDITOR_CONTEXT_LIMITS,
  AI_EDITOR_CONTEXT_VERSION,
  type AiEditorContext,
  type AiEditorSelectionAnchor,
} from './editor-context';
import { computeSceneRevision } from './scene-revision';

export type CapturedSelectionBlock = VNPlateSelectionBlock;

/** A frame's selection, tied to the scene that frame edits. */
export interface CapturedSelection extends Omit<VNPlateSelectionState, 'seq'> {
  sceneId: string;
}

export interface ResolveSelectionAnchorsInput {
  /** The scene as stored — after the save the capture triggered, if there was one. */
  scene: SceneRecord;
  /** The editor document the selection was captured from; null when the frame could not answer. */
  document: DocumentScene | null;
  characters: Character[];
  blocks: CapturedSelectionBlock[];
}

interface AlignedOrigin {
  partIndex: number | null;
  step: TimelineStep;
}

function textOfStep(step: TimelineStep): string | null {
  if (step.blockType === 'text') return (step.data as TextBlockData).content ?? '';
  if (step.blockType === 'dialogue') return (step.data as DialogueBlockData).entries[0]?.text ?? '';
  return null;
}

function partCount(parts: unknown): number {
  return Array.isArray(parts) ? parts.length : 0;
}

/**
 * Pairs each document block with the stored steps it produced, or returns null
 * when the captured document and the stored scene are not the same content.
 */
function alignOrigins(
  scene: SceneRecord,
  document: DocumentScene,
  characters: Character[],
): Map<string, AlignedOrigin[]> | null {
  const normalized = normalizePlateDocumentScene(document, characters);
  const { timeline, origins } = documentSceneToTimelineWithOrigins(normalized.scene, normalized.characters);
  if (timeline.length !== scene.timeline.length) return null;

  const storedByConvertedId = new Map<string, TimelineStep>();
  for (let index = 0; index < timeline.length; index += 1) {
    const converted = timeline[index];
    const stored = scene.timeline[index];
    if (converted.blockType !== stored.blockType) return null;
    const text = textOfStep(converted);
    if (text !== null && text !== textOfStep(stored)) return null;
    storedByConvertedId.set(converted.id, stored);
  }

  // The frame numbers parts before normalization. A block whose part list
  // changed length on the way cannot be addressed by those numbers.
  const capturedParts = new Map(document.blocks.map((block) => [block.id, partCount((block as { parts?: unknown }).parts)]));
  const renumbered = new Set(
    normalized.scene.blocks
      .filter((block) => capturedParts.has(block.id)
        && capturedParts.get(block.id) !== partCount((block as { parts?: unknown }).parts))
      .map((block) => block.id),
  );

  const byBlock = new Map<string, AlignedOrigin[]>();
  for (const origin of origins) {
    if (renumbered.has(origin.blockId)) continue;
    const step = storedByConvertedId.get(origin.stepId);
    if (!step) continue;
    const list = byBlock.get(origin.blockId) ?? [];
    list.push({ partIndex: origin.partIndex, step });
    byBlock.set(origin.blockId, list);
  }
  return byBlock;
}

function anchorForStep(
  step: TimelineStep,
  quote: string,
  occurrence: number,
  match: 'exact' | 'quote',
): AiEditorSelectionAnchor {
  if (step.blockType === 'dialogue') {
    const entryId = (step.data as DialogueBlockData).entries[0]?.id;
    return {
      stepId: step.id,
      blockKind: 'dialogue',
      field: 'entryText',
      ...(entryId ? { entryId } : {}),
      quote,
      occurrence,
      match,
    };
  }
  return { stepId: step.id, blockKind: 'text', field: 'content', quote, occurrence, match };
}

function visibleText(value: string): string {
  return stripRichText(value).replace(/ /g, ' ');
}

function findByQuote(
  scene: SceneRecord,
  kind: DocumentBlockKind,
  quote: string,
  occurrence: number,
): AiEditorSelectionAnchor {
  const needle = visibleText(quote).trim();
  const matches = needle
    ? scene.timeline.filter((step) => {
        const text = textOfStep(step);
        return text !== null && visibleText(text).includes(needle);
      })
    : [];
  if (matches.length === 1) return anchorForStep(matches[0], quote, occurrence, 'quote');
  return {
    stepId: null,
    blockKind: kind === 'dialogue' ? 'dialogue' : 'text',
    field: kind === 'dialogue' ? 'entryText' : 'content',
    quote,
    occurrence,
    match: matches.length > 1 ? 'ambiguous' : 'none',
  };
}

export function resolveSelectionAnchors(input: ResolveSelectionAnchorsInput): AiEditorSelectionAnchor[] {
  const aligned = input.document ? alignOrigins(input.scene, input.document, input.characters) : null;
  const anchors: AiEditorSelectionAnchor[] = [];

  for (const block of input.blocks) {
    const origins = aligned?.get(block.id) ?? [];
    if (block.parts?.length) {
      for (const part of block.parts) {
        const origin = origins.find((item) => item.partIndex === part.index);
        anchors.push(origin
          ? anchorForStep(origin.step, part.quote, part.occurrence, 'exact')
          : findByQuote(input.scene, block.kind, part.quote, part.occurrence));
      }
      continue;
    }
    const whole = origins.filter((item) => item.partIndex === null);
    anchors.push(whole.length === 1
      ? anchorForStep(whole[0].step, block.quote, block.occurrence, 'exact')
      : findByQuote(input.scene, block.kind, block.quote, block.occurrence));
  }

  return anchors.slice(0, AI_EDITOR_CONTEXT_LIMITS.anchors);
}

export interface BuildAiEditorContextInput {
  snapshotId: string;
  kind: AiEditorContext['kind'];
  storyId: string;
  scene: SceneRecord | null;
  sceneSource: 'selection' | 'scroll';
  activePathSceneIds?: string[];
  hasUnsavedChanges: boolean;
  selection: CapturedSelection | null;
  anchors: AiEditorSelectionAnchor[];
  capturedAt: number;
}

const SHORT_ANCHOR_QUOTE = 120;
const MIN_SELECTION_TEXT = 200;

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * Sheds the least useful detail until the context fits its byte budget: the
 * path list first, then long per-anchor quotes (the step id already says
 * where), then the tail of the selection itself.
 */
function fitToBudget(context: AiEditorContext): AiEditorContext {
  let next = context;
  if (byteLength(next) <= AI_EDITOR_CONTEXT_LIMITS.bytes) return next;

  if (next.activePathSceneIds) {
    const { activePathSceneIds: _dropped, ...rest } = next;
    next = rest;
  }
  if (!next.selection || byteLength(next) <= AI_EDITOR_CONTEXT_LIMITS.bytes) return next;

  next = {
    ...next,
    selection: {
      ...next.selection,
      anchors: next.selection.anchors.map((anchor) => ({ ...anchor, quote: anchor.quote.slice(0, SHORT_ANCHOR_QUOTE) })),
    },
  };
  while (
    next.selection
    && byteLength(next) > AI_EDITOR_CONTEXT_LIMITS.bytes
    && next.selection.text.length > MIN_SELECTION_TEXT
  ) {
    const length = Math.max(MIN_SELECTION_TEXT, Math.floor(next.selection.text.length / 2));
    next = { ...next, selection: { ...next.selection, text: next.selection.text.slice(0, length), truncated: true } };
  }
  return next;
}

export function buildAiEditorContext(input: BuildAiEditorContextInput): AiEditorContext {
  const selection = input.selection;
  const text = selection ? selection.text.slice(0, AI_EDITOR_CONTEXT_LIMITS.selectionText) : '';

  return fitToBudget({
    version: AI_EDITOR_CONTEXT_VERSION,
    snapshotId: input.snapshotId,
    kind: input.kind,
    screen: 'editor',
    storyId: input.storyId,
    scene: input.scene
      ? {
          id: input.scene.id,
          name: input.scene.name,
          revision: computeSceneRevision(input.scene),
          source: input.sceneSource,
        }
      : null,
    ...(input.activePathSceneIds?.length
      ? { activePathSceneIds: input.activePathSceneIds.slice(0, AI_EDITOR_CONTEXT_LIMITS.activePathScenes) }
      : {}),
    hasUnsavedChanges: input.hasUnsavedChanges,
    selection: selection
      ? {
          sceneId: selection.sceneId,
          collapsed: selection.collapsed,
          text,
          textLength: Math.max(selection.textLength, selection.text.length),
          truncated: selection.truncated || selection.text.length > text.length,
          // The words nearest the selection are the ones that locate it.
          before: selection.before.slice(-AI_EDITOR_CONTEXT_LIMITS.surroundingText),
          after: selection.after.slice(0, AI_EDITOR_CONTEXT_LIMITS.surroundingText),
          crossesChip: selection.crossesChip,
          anchors: input.anchors.slice(0, AI_EDITOR_CONTEXT_LIMITS.anchors).map((anchor) => ({
            ...anchor,
            quote: anchor.quote.slice(0, AI_EDITOR_CONTEXT_LIMITS.selectionText),
          })),
        }
      : null,
    capturedAt: input.capturedAt,
  });
}
