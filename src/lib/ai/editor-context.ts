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
  bytes: 16_384,
} as const;

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
  capturedAt: z.number(),
});

export type AiEditorContext = z.infer<typeof aiEditorContextSchema>;
export type AiEditorSelectionAnchor = z.infer<typeof anchorSchema>;

export type ParseAiEditorContextResult =
  | { ok: true; context: AiEditorContext }
  | { ok: false; reason: 'INVALID_SHAPE' | 'TOO_LARGE' };

/** The receiving side never trusts the sender's own limits, so size is checked here too. */
export function parseAiEditorContext(value: unknown): ParseAiEditorContextResult {
  const parsed = aiEditorContextSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: 'INVALID_SHAPE' };
  const bytes = new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength;
  if (bytes > AI_EDITOR_CONTEXT_LIMITS.bytes) return { ok: false, reason: 'TOO_LARGE' };
  return { ok: true, context: parsed.data };
}
