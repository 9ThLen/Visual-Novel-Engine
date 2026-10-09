import type {
  VNPlateFocusedBlock,
  VNPlateSelectionBlock,
  VNPlateSelectionPart,
  VNPlateSelectionState,
} from './types';

/**
 * Limits the frame applies before posting. The host applies them again: a
 * message is data from another document, whatever produced it.
 */
export const SELECTION_STATE_LIMITS = {
  text: 4000,
  surroundingText: 300,
  blocks: 20,
  partsPerBlock: 64,
  blockId: 200,
  command: 40,
} as const;

const FOCUS_KINDS = ['text', 'dialogue', 'choice', 'technical'] as const;
const FOCUS_STATES = ['editing', 'selected', 'recent'] as const;

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

function sanitizeFocus(value: unknown): VNPlateFocusedBlock | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || value.id.length > SELECTION_STATE_LIMITS.blockId) return null;
  const kind = FOCUS_KINDS.find((item) => item === value.kind);
  const state = FOCUS_STATES.find((item) => item === value.state);
  if (!kind || !state) return null;
  // Becomes part of what the assistant reads, so it stays a plain identifier.
  const command = typeof value.command === 'string' && /^[A-Za-z_]+$/.test(value.command)
    ? value.command.slice(0, SELECTION_STATE_LIMITS.command)
    : '';
  const isChip = kind === 'text' || kind === 'dialogue';
  const partIndex = typeof value.partIndex === 'number' && Number.isInteger(value.partIndex) && value.partIndex >= 0
    ? value.partIndex
    : null;
  // A text block is only ever in focus through one of its chips.
  if (isChip && partIndex === null) return null;
  return {
    id: value.id,
    kind,
    command,
    ...(isChip && partIndex !== null ? { partIndex } : {}),
    state,
  };
}

export function sanitizeSelectionState(value: unknown): VNPlateSelectionState | null {
  if (!isRecord(value) || typeof value.seq !== 'number' || !Number.isFinite(value.seq)) return null;
  const text = clippedString(value.text, SELECTION_STATE_LIMITS.text);
  const focus = sanitizeFocus(value.focus);
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
    ...(focus ? { focus } : {}),
  };
}
