/**
 * Reader appearance (theme colors and closed layout preset) patch pipeline.
 *
 * Mirrors the ScenePatch contract: pure validate/apply/describe functions with
 * no store access, guarded by an expectedRevision so a concurrent edit in Theme
 * Studio cannot be silently overwritten. The model can patch the eight
 * StoryReaderTheme colors and one closed layout enum, never arbitrary CSS/JSX.
 */
import { z } from 'zod';

import type { StoryMetadata } from '@/lib/story-domain';
import {
  sanitizeReaderLayoutPreset,
  sanitizeStoryTheme,
  type StoryReaderLayoutPreset,
  type StoryReaderTheme,
} from '@/lib/story-theme';
import { evaluateThemeContrast, MIN_TEXT_CONTRAST } from '@/lib/theme-contrast';
import { hashStable } from './scene-revision';

export const THEME_COLOR_KEYS = [
  'dialogueBg',
  'dialogueText',
  'dialogueBorder',
  'nameBg',
  'nameText',
  'choiceBg',
  'choiceBorder',
  'choiceText',
] as const satisfies readonly (keyof StoryReaderTheme)[];

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export interface AiReaderAppearancePatch {
  storyId: string;
  expectedRevision: string;
  /** Colors to set. Keys omitted are left untouched. */
  theme?: Partial<Record<ThemeColorKey, string>>;
  layoutPreset?: StoryReaderLayoutPreset;
  explanation: string;
}

export const aiReaderAppearancePatchSchema: z.ZodType<AiReaderAppearancePatch> = z.object({
  storyId: z.string().min(1),
  expectedRevision: z.string().min(1),
  theme: z.object(
    Object.fromEntries(
      THEME_COLOR_KEYS.map((key) => [key, z.string().regex(HEX_COLOR, 'Expected #rgb, #rrggbb, or #rrggbbaa').optional()]),
    ) as Record<ThemeColorKey, z.ZodOptional<z.ZodString>>,
  ).optional(),
  layoutPreset: z.enum(['classic', 'compact', 'top']).optional(),
  explanation: z.string(),
});

/** Revision of the story's appearance only — unaffected by scene or metadata edits. */
export function computeAppearanceRevision(
  metadata: Pick<StoryMetadata, 'theme' | 'readerLayoutPreset'> | undefined,
): string {
  return hashStable({
    theme: metadata?.theme ?? null,
    layoutPreset: sanitizeReaderLayoutPreset(metadata?.readerLayoutPreset),
  });
}

export interface AppearancePatchColorChange {
  key: ThemeColorKey;
  before: string | null;
  after: string;
}

export interface AppearancePatchDescription {
  storyId: string;
  colors: AppearancePatchColorChange[];
  warnings: string[];
  layoutPreset?: { before: StoryReaderLayoutPreset; after: StoryReaderLayoutPreset };
}

export type ValidateAppearancePatchResult =
  | { ok: true; warnings: string[] }
  | { ok: false; code: 'STALE_REVISION' | 'VALIDATION_FAILED'; errors: string[] };

/** The theme the story would have if the patch were applied. */
export function mergeAppearancePatch(
  current: StoryReaderTheme | undefined,
  patch: AiReaderAppearancePatch,
): StoryReaderTheme {
  return sanitizeStoryTheme({ ...(current ?? {}), ...patch.theme }) ?? {};
}

function contrastWarnings(theme: StoryReaderTheme): string[] {
  return evaluateThemeContrast(theme).map((issue) =>
    issue.backgroundDependent
      ? `Low contrast on ${issue.pair} (${issue.ratio.toFixed(1)}:1, depends on the scene behind it; WCAG wants ${MIN_TEXT_CONTRAST}:1)`
      : `Low contrast on ${issue.pair} (${issue.ratio.toFixed(1)}:1, WCAG wants ${MIN_TEXT_CONTRAST}:1)`,
  );
}

export function validateAiAppearancePatch(
  metadata: Pick<StoryMetadata, 'id' | 'theme' | 'readerLayoutPreset'>,
  patch: AiReaderAppearancePatch,
): ValidateAppearancePatchResult {
  const errors: string[] = [];

  if (patch.storyId !== metadata.id) errors.push(`Patch targets story '${patch.storyId}' but '${metadata.id}' is open`);

  const parsed = aiReaderAppearancePatchSchema.safeParse(patch);
  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => `${issue.path.join('.') || 'patch'}: ${issue.message}`));
  }

  const entries = Object.entries(patch.theme ?? {}).filter(([, value]) => value !== undefined);
  const layoutChanges = patch.layoutPreset !== undefined
    && sanitizeReaderLayoutPreset(patch.layoutPreset) !== sanitizeReaderLayoutPreset(metadata.readerLayoutPreset);
  if (entries.length === 0 && !layoutChanges) errors.push('Patch changes no appearance settings');

  if (errors.length > 0) return { ok: false, code: 'VALIDATION_FAILED', errors };

  if (patch.expectedRevision !== computeAppearanceRevision(metadata)) {
    return {
      ok: false,
      code: 'STALE_REVISION',
      errors: ['The reader theme changed since it was read. Re-read the story appearance and rebuild the patch.'],
    };
  }

  // Contrast is a warning, never a hard block: an author may deliberately want a
  // low-contrast look, and the preview surfaces the ratio before they confirm.
  return { ok: true, warnings: contrastWarnings(mergeAppearancePatch(metadata.theme, patch)) };
}

export function applyAiAppearancePatch(metadata: StoryMetadata, patch: AiReaderAppearancePatch): StoryReaderTheme {
  return mergeAppearancePatch(metadata.theme, patch);
}

export function applyAiReaderLayoutPreset(
  metadata: Pick<StoryMetadata, 'readerLayoutPreset'>,
  patch: AiReaderAppearancePatch,
): StoryReaderLayoutPreset {
  return sanitizeReaderLayoutPreset(patch.layoutPreset ?? metadata.readerLayoutPreset);
}

export function describeAiAppearancePatch(
  metadata: Pick<StoryMetadata, 'id' | 'theme' | 'readerLayoutPreset'>,
  patch: AiReaderAppearancePatch,
): AppearancePatchDescription {
  const current = metadata.theme ?? {};
  const next = mergeAppearancePatch(metadata.theme, patch);

  const colors = THEME_COLOR_KEYS.flatMap<AppearancePatchColorChange>((key) => {
    const after = next[key];
    if (!after || after === current[key]) return [];
    return [{ key, before: current[key] ?? null, after }];
  });

  const beforeLayout = sanitizeReaderLayoutPreset(metadata.readerLayoutPreset);
  const afterLayout = applyAiReaderLayoutPreset(metadata, patch);
  return {
    storyId: patch.storyId,
    colors,
    warnings: contrastWarnings(next),
    ...(beforeLayout !== afterLayout ? { layoutPreset: { before: beforeLayout, after: afterLayout } } : {}),
  };
}
