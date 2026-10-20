/**
 * Turns a selection captured in the editor frame into step addresses the
 * assistant can act on.
 *
 * A selection is known by the frame's own block ids and part positions, while
 * a patch needs step ids — and those are minted on save. The only code that
 * knows which block became which step is the document converter, so the
 * captured document is converted again here and its output is laid over the
 * stored timeline position by position. The pairing is trusted only when the
 * two line up exactly and the pair itself is shown to be one step; anything
 * else falls back to finding the quote, which is never reported as `exact`.
 *
 * A block that is not text — a background, a choice, an inline effect — is
 * addressed whole, and mostly carries its step's id with it, so it has a
 * second way to be found; see `resolveFocusedBlock`.
 */
import type { Character } from '@/lib/character-types';
import { documentSceneToTimelineWithOrigins } from '@/lib/document-editor/document-scene';
import type { DocumentBlock, DocumentBlockKind, DocumentScene } from '@/lib/document-editor/types';
import type { DialogueBlockData, SceneRecord, TextBlockData, TimelineStep } from '@/lib/engine/types';
import { stripRichText } from '@/lib/rich-text';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateFocusedBlock, VNPlateSelectionBlock, VNPlateSelectionState } from '@/lib/vn-plate-editor/types';
import {
  AI_EDITOR_CONTEXT_LIMITS,
  AI_EDITOR_CONTEXT_VERSION,
  jsonByteLength,
  type AiEditorContext,
  type AiEditorFocus,
  type AiEditorSelectionAnchor,
} from './editor-context';
import { computeSceneRevision, stableStringify } from './scene-revision';

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
  /** See `ResolveFocusedBlockInput.hasUnsavedChanges`. */
  hasUnsavedChanges?: boolean;
}

interface AlignedOrigin {
  partIndex: number | null;
  step: TimelineStep;
}

interface AlignedDocument {
  /** Stored steps holding the text of each block. */
  textByBlock: Map<string, AlignedOrigin[]>;
  /** The stored step a non-text block, or one of its inline chips, became. */
  stepByBlockPart: Map<string, TimelineStep>;
}

const blockPartKey = (blockId: string, partIndex: number | null) => `${blockId}\u0000${partIndex ?? ''}`;

function textOfStep(step: TimelineStep): string | null {
  if (step.blockType === 'text') return (step.data as TextBlockData).content ?? '';
  if (step.blockType === 'dialogue') return (step.data as DialogueBlockData).entries[0]?.text ?? '';
  return null;
}

function partCount(parts: unknown): number {
  return Array.isArray(parts) ? parts.length : 0;
}

/**
 * The step a technical block holds. The frame sends a block of a kind it has
 * no form for without one, whatever the type says; the save makes it then.
 */
function heldStep(block: DocumentBlock | undefined): TimelineStep | null {
  return block?.kind === 'technical' ? (block.step as TimelineStep | null) ?? null : null;
}

/**
 * Step ids the document itself holds. A block is saved under the id it holds,
 * so one of these that the store does not have belongs to a block that has not
 * been saved yet.
 */
function stepIdsHeldBy(document: DocumentScene): Set<string> {
  const ids = new Set<string>();
  for (const block of document.blocks) {
    const held = heldStep(block)?.id ?? block.sourceStep?.id;
    if (held) ids.add(held);
    if (block.kind !== 'text' && block.kind !== 'dialogue') continue;
    for (const part of block.parts ?? []) {
      if (part.type !== 'text') ids.add(part.id);
    }
  }
  return ids;
}

/**
 * Pairs each document block with the stored steps it produced, or returns null
 * when the captured document and the stored scene are not the same content.
 *
 * Lining up by place and kind shows the two have the same shape, not that a
 * step is the one across from it: two backgrounds swapped in an unsaved draft
 * still line up, and so does a new background put where a deleted one was. So
 * each pair is proven on its own. A block saved before holds its step's id, and
 * then the id is the whole answer — including "no step" for an id the store has
 * never seen. Only a step whose id this conversion made up is placed by
 * position: when the editor has nothing unsaved, the stored step there belongs
 * to no other block, and the two hold the same content.
 */
function alignOrigins(
  scene: SceneRecord,
  document: DocumentScene,
  characters: Character[],
  hasUnsavedChanges: boolean,
): AlignedDocument | null {
  const normalized = normalizePlateDocumentScene(document, characters);
  const { timeline, origins, blockSteps } = documentSceneToTimelineWithOrigins(normalized.scene, normalized.characters);
  if (timeline.length !== scene.timeline.length) return null;

  const storedIds = new Set(scene.timeline.map((step) => step.id));
  const heldIds = stepIdsHeldBy(document);
  const carriedIds = new Set(timeline.filter((step) => storedIds.has(step.id)).map((step) => step.id));
  const storedByConvertedId = new Map<string, TimelineStep>();
  for (let index = 0; index < timeline.length; index += 1) {
    const converted = timeline[index];
    const stored = scene.timeline[index];
    if (converted.blockType !== stored.blockType) return null;
    const text = textOfStep(converted);
    if (text !== null && text !== textOfStep(stored)) return null;
    const isSameStep = carriedIds.has(converted.id)
      ? converted.id === stored.id
      : !hasUnsavedChanges
        && !heldIds.has(converted.id)
        && !carriedIds.has(stored.id)
        && (text !== null || stableStringify(converted.data) === stableStringify(stored.data));
    if (isSameStep) storedByConvertedId.set(converted.id, stored);
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

  const stepByBlockPart = new Map<string, TimelineStep>();
  for (const blockStep of blockSteps) {
    // A chip is named by its part number, which renumbering makes meaningless.
    if (blockStep.partIndex !== null && renumbered.has(blockStep.blockId)) continue;
    const step = storedByConvertedId.get(blockStep.stepId);
    if (step) stepByBlockPart.set(blockPartKey(blockStep.blockId, blockStep.partIndex), step);
  }
  return { textByBlock: byBlock, stepByBlockPart };
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
  const aligned = input.document
    ? alignOrigins(input.scene, input.document, input.characters, input.hasUnsavedChanges === true)
    : null;
  const anchors: AiEditorSelectionAnchor[] = [];

  for (const block of input.blocks) {
    const origins = aligned?.textByBlock.get(block.id) ?? [];
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

export interface ResolveFocusedBlockInput {
  /** The scene as stored — after the save the capture triggered, if there was one. */
  scene: SceneRecord;
  /** The editor document the focus was captured from; null when the frame could not answer. */
  document: DocumentScene | null;
  characters: Character[];
  focus: VNPlateFocusedBlock | null | undefined;
  /**
   * The editor holds work the store does not have. The document and the scene
   * are then two different things, and a step is named only by an id the
   * document holds: a place in one says nothing about the other.
   */
  hasUnsavedChanges?: boolean;
}

/** The id of the step a block will be saved as, when the block carries one. */
function carriedStepId(block: DocumentBlock | undefined, partIndex: number | null): string | null {
  if (!block) return null;
  if (partIndex !== null) {
    const part = (block.kind === 'text' || block.kind === 'dialogue') ? block.parts?.[partIndex] : undefined;
    return part && part.type !== 'text' ? part.id : null;
  }
  if (block.kind === 'technical') return heldStep(block)?.id ?? null;
  return block.sourceStep?.id ?? null;
}

function clip(value: string, limit: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

/** What the block shows in the editor, in the document's own words. */
function describeFocusedBlock(block: DocumentBlock | undefined, partIndex: number | null): string {
  if (!block) return '';
  if (partIndex !== null) {
    const part = (block.kind === 'text' || block.kind === 'dialogue') ? block.parts?.[partIndex] : undefined;
    if (!part || part.type === 'text') return '';
    return part.type === 'effect' ? part.effectType : part.mode;
  }
  if (block.kind === 'technical') return [block.label, block.summary].filter(Boolean).join(': ');
  if (block.kind === 'choice') return [block.question, ...block.options.map((option) => option.text)].filter(Boolean).join(' / ');
  return '';
}

/**
 * Names the stored step of the non-text block the author is working with.
 *
 * Unlike a line of text, such a block usually carries its step's id through a
 * save, so there are two ways to it. The converter's pairing comes first, and
 * is the only one that reaches a block made in this session whose step id is
 * minted on save. When the captured document and the stored scene have drifted
 * apart — the author typed elsewhere and has not saved — the id the block
 * carries still names its step, provided the stored step is the same kind.
 */
export function resolveFocusedBlock(input: ResolveFocusedBlockInput): AiEditorFocus | null {
  const focus = input.focus;
  if (!focus) return null;
  const partIndex = focus.partIndex ?? null;
  const block = input.document?.blocks.find((item) => item.id === focus.id);
  const aligned = input.document
    ? alignOrigins(input.scene, input.document, input.characters, input.hasUnsavedChanges === true)
    : null;

  let step = aligned?.stepByBlockPart.get(blockPartKey(focus.id, partIndex)) ?? null;
  if (!step) {
    // With no document to read, a block loaded from the store still has the id
    // of the step it was built from.
    const carriedId = input.document ? carriedStepId(block, partIndex) : (partIndex === null ? focus.id : null);
    const candidate = carriedId ? input.scene.timeline.find((item) => item.id === carriedId) : undefined;
    const expectedType = heldStep(block)?.blockType ?? (block?.kind === 'choice' ? 'choice' : null);
    if (candidate && (!expectedType || candidate.blockType === expectedType)) step = candidate;
  }

  const summary = clip(describeFocusedBlock(block, partIndex), AI_EDITOR_CONTEXT_LIMITS.focusSummary);
  const blockType = step?.blockType
    ?? heldStep(block)?.blockType
    ?? (focus.command || focus.kind);
  // The settings as stored: what the step says, not what an open settings
  // panel may show before it is saved. A step with too many goes without them,
  // and the assistant reads it from the scene.
  const data = step && jsonByteLength(step.data) <= AI_EDITOR_CONTEXT_LIMITS.focusData
    ? step.data as unknown as Record<string, unknown>
    : null;
  return {
    sceneId: input.scene.id,
    blockType: blockType.slice(0, AI_EDITOR_CONTEXT_LIMITS.focusBlockType),
    stepId: step?.id ?? null,
    match: step ? 'exact' : 'none',
    state: focus.state,
    ...(summary ? { summary } : {}),
    ...(data ? { data } : {}),
  };
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
  focus?: AiEditorFocus | null;
  capturedAt: number;
}

const SHORT_ANCHOR_QUOTE = 120;
const MIN_SELECTION_TEXT = 200;

function withoutFocusData(context: AiEditorContext): AiEditorContext {
  if (!context.focus?.data) return context;
  const { data: _dropped, ...focus } = context.focus;
  return { ...context, focus };
}

/**
 * Sheds the least useful detail until the context fits its byte budget: the
 * path list first, then the focused step's settings (the step id still says
 * where, and the scene has them), then long per-anchor quotes, then the tail
 * of the selection itself. A block whose settings are open is what the author
 * is working on, and its settings go last.
 */
function fitToBudget(context: AiEditorContext): AiEditorContext {
  let next = context;
  if (jsonByteLength(next) <= AI_EDITOR_CONTEXT_LIMITS.bytes) return next;

  if (next.activePathSceneIds) {
    const { activePathSceneIds: _dropped, ...rest } = next;
    next = rest;
  }
  if (next.focus?.state !== 'editing' && jsonByteLength(next) > AI_EDITOR_CONTEXT_LIMITS.bytes) next = withoutFocusData(next);
  if (!next.selection || jsonByteLength(next) <= AI_EDITOR_CONTEXT_LIMITS.bytes) return next;

  next = {
    ...next,
    selection: {
      ...next.selection,
      anchors: next.selection.anchors.map((anchor) => ({ ...anchor, quote: anchor.quote.slice(0, SHORT_ANCHOR_QUOTE) })),
    },
  };
  while (
    next.selection
    && jsonByteLength(next) > AI_EDITOR_CONTEXT_LIMITS.bytes
    && next.selection.text.length > MIN_SELECTION_TEXT
  ) {
    const length = Math.max(MIN_SELECTION_TEXT, Math.floor(next.selection.text.length / 2));
    next = { ...next, selection: { ...next.selection, text: next.selection.text.slice(0, length), truncated: true } };
  }
  return jsonByteLength(next) > AI_EDITOR_CONTEXT_LIMITS.bytes ? withoutFocusData(next) : next;
}

export function buildAiEditorContext(input: BuildAiEditorContextInput): AiEditorContext {
  // A state reported for a block in focus may hold no text selection at all;
  // an empty one would only tell the assistant there is something to look for.
  const selection = input.selection && (input.selection.blocks.length || input.selection.text)
    ? input.selection
    : null;
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
    ...(input.focus ? { focus: input.focus } : {}),
    capturedAt: input.capturedAt,
  });
}
