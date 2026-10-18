import { z } from 'zod';

/**
 * What the assistant is told about where the author is and what they selected.
 *
 * Shared by the browser and the bridge, so this module stays schema-only: the
 * bridge bundle must not pull in the document converter the resolver needs.
 */
export const AI_EDITOR_CONTEXT_VERSION = 1 as const;

export const AI_EDITOR_CONTEXT_LIMITS = {
  selectionText: 4000,
  surroundingText: 300,
  anchors: 20,
  activePathScenes: 100,
  focusBlockType: 40,
  focusSummary: 200,
  /** Bytes of JSON for a focused step's settings; a step with more goes without them. */
  focusData: 4_096,
  bytes: 16_384,
} as const;

/** The size a value takes in the context, which travels as JSON. */
export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * `exact` comes from the document converter's own block-to-step pairing.
 * `quote` is a unique text match and may point at the wrong repeat of a phrase
 * the author edited elsewhere; `ambiguous` and `none` name no step at all.
 */
export const AI_EDITOR_ANCHOR_MATCHES = ['exact', 'quote', 'ambiguous', 'none'] as const;
export type AiEditorAnchorMatch = typeof AI_EDITOR_ANCHOR_MATCHES[number];

const anchorSchema = z.object({
  stepId: z.string().min(1).nullable(),
  blockKind: z.enum(['text', 'dialogue']),
  field: z.enum(['content', 'entryText']),
  entryId: z.string().min(1).optional(),
  quote: z.string().max(AI_EDITOR_CONTEXT_LIMITS.selectionText),
  occurrence: z.number().int().min(0),
  match: z.enum(AI_EDITOR_ANCHOR_MATCHES),
}).refine(
  (anchor) => (anchor.match === 'exact' || anchor.match === 'quote') === (anchor.stepId !== null),
  { message: 'An anchor names a step exactly when its match is exact or quote' },
);

const selectionSchema = z.object({
  sceneId: z.string().min(1),
  collapsed: z.boolean(),
  text: z.string().max(AI_EDITOR_CONTEXT_LIMITS.selectionText),
  textLength: z.number().int().min(0),
  truncated: z.boolean(),
  before: z.string().max(AI_EDITOR_CONTEXT_LIMITS.surroundingText),
  after: z.string().max(AI_EDITOR_CONTEXT_LIMITS.surroundingText),
  crossesChip: z.boolean(),
  anchors: z.array(anchorSchema).max(AI_EDITOR_CONTEXT_LIMITS.anchors),
});

/**
 * `editing`: the block's settings are open. `selected`: it is highlighted.
 * `recent`: the last block the author worked with before turning to the chat.
 */
export const AI_EDITOR_FOCUS_STATES = ['editing', 'selected', 'recent'] as const;

/**
 * A block that is not a run of text — a background, a choice, a transition, an
 * inline effect — which the author has in hand. It is addressed whole: there
 * is no quote inside it, so a focus either names its step or names none.
 */
const focusSchema = z.object({
  sceneId: z.string().min(1),
  /** The step's block type; the editor's own name for the block when no step could be named. */
  blockType: z.string().min(1).max(AI_EDITOR_CONTEXT_LIMITS.focusBlockType),
  stepId: z.string().min(1).nullable(),
  match: z.enum(['exact', 'none']),
  state: z.enum(AI_EDITOR_FOCUS_STATES),
  /** What the block shows in the editor, so it can be told from its neighbours. */
  summary: z.string().max(AI_EDITOR_CONTEXT_LIMITS.focusSummary).optional(),
  /**
   * The step's settings as stored — its `data` — so the assistant can change
   * them without reading the scene first. Left out when they do not fit.
   */
  data: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (focus) => (focus.match === 'exact') === (focus.stepId !== null),
  { message: 'A focus names a step exactly when its match is exact' },
).refine(
  (focus) => focus.data === undefined || focus.stepId !== null,
  { message: 'Only a step named exactly comes with its settings' },
).refine(
  (focus) => focus.data === undefined || jsonByteLength(focus.data) <= AI_EDITOR_CONTEXT_LIMITS.focusData,
  { message: 'A focused step’s settings are too large to come with it' },
);

export const aiEditorContextSchema = z.object({
  version: z.literal(AI_EDITOR_CONTEXT_VERSION),
  snapshotId: z.string().min(1).max(100),
  kind: z.enum(['fixed', 'live']),
  screen: z.literal('editor'),
  storyId: z.string().min(1),
  scene: z.object({
    id: z.string().min(1),
    name: z.string(),
    revision: z.string().min(1),
    source: z.enum(['selection', 'scroll']),
  }).nullable(),
  activePathSceneIds: z.array(z.string().min(1)).max(AI_EDITOR_CONTEXT_LIMITS.activePathScenes).optional(),
  hasUnsavedChanges: z.boolean(),
  selection: selectionSchema.nullable(),
  focus: focusSchema.optional(),
  capturedAt: z.number(),
});

export type AiEditorContext = z.infer<typeof aiEditorContextSchema>;
export type AiEditorSelectionAnchor = z.infer<typeof anchorSchema>;
export type AiEditorFocus = z.infer<typeof focusSchema>;

export type ParseAiEditorContextResult =
  | { ok: true; context: AiEditorContext }
  | { ok: false; reason: 'INVALID_SHAPE' | 'TOO_LARGE' };

/** The receiving side never trusts the sender's own limits, so size is checked here too. */
export function parseAiEditorContext(value: unknown): ParseAiEditorContextResult {
  const parsed = aiEditorContextSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: 'INVALID_SHAPE' };
  if (jsonByteLength(parsed.data) > AI_EDITOR_CONTEXT_LIMITS.bytes) return { ok: false, reason: 'TOO_LARGE' };
  return { ok: true, context: parsed.data };
}
