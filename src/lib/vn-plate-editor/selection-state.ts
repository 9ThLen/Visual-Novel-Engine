import type { VNPlateSelectionBlock, VNPlateSelectionPart, VNPlateSelectionState } from './types';

/**
 * Limits the frame applies before posting. The host applies them again: a
 * message is data from another document, whatever produced it.
 */
export const SELECTION_STATE_LIMITS = {
  text: 4000,
  surroundingText: 300,
  blocks: 20,
  partsPerBlock: 64,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clippedString(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function sanitizePart(value: unknown): VNPlateSelectionPart | null {
  if (!isRecord(value) || typeof value.index !== 'number' || !Number.isInteger(value.index) || value.index < 0) return null;
  return {
    index: value.index,
    quote: clippedString(value.quote, SELECTION_STATE_LIMITS.text),
    occurrence: count(value.occurrence),
  };
}

function sanitizeBlock(value: unknown): VNPlateSelectionBlock | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (value.kind !== 'text' && value.kind !== 'dialogue') return null;
  const parts = Array.isArray(value.parts)
    ? value.parts
        .slice(0, SELECTION_STATE_LIMITS.partsPerBlock)
        .map(sanitizePart)
        .filter((part): part is VNPlateSelectionPart => part !== null)
    : undefined;
  return {
    id: value.id,
    kind: value.kind,
    quote: clippedString(value.quote, SELECTION_STATE_LIMITS.text),
    occurrence: count(value.occurrence),
    ...(parts ? { parts } : {}),
  };
}

export function sanitizeSelectionState(value: unknown): VNPlateSelectionState | null {
  if (!isRecord(value) || typeof value.seq !== 'number' || !Number.isFinite(value.seq)) return null;
  const text = clippedString(value.text, SELECTION_STATE_LIMITS.text);
  return {
    seq: value.seq,
    collapsed: value.collapsed === true,
    text,
    textLength: Math.max(count(value.textLength), text.length),
    truncated: value.truncated === true,
    before: clippedString(value.before, SELECTION_STATE_LIMITS.surroundingText),
    after: clippedString(value.after, SELECTION_STATE_LIMITS.surroundingText),
    crossesChip: value.crossesChip === true,
    blocks: Array.isArray(value.blocks)
      ? value.blocks
          .slice(0, SELECTION_STATE_LIMITS.blocks)
          .map(sanitizeBlock)
          .filter((block): block is VNPlateSelectionBlock => block !== null)
      : [],
  };
}
