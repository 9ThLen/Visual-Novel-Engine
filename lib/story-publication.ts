/**
 * Publication metadata — what a store page has to answer before a reader
 * commits, and what a release manifest carries as its `publication` block.
 *
 * Lives beside `lib/story-theme.ts` rather than inside `lib/story-domain.ts` or
 * `lib/release/` for one structural reason: `story-domain` describes the stored
 * story and `lib/release` describes the published artifact, and both need these
 * types. Putting them in either would make the two import each other.
 *
 * Every sanitizer is total and idempotent: it accepts `unknown`, returns either
 * a clean value or `undefined`, and never throws. They run at the same
 * normalization boundary as tags and themes, so a broken value from an import,
 * an old persisted story, or a hand-edited file is cleaned before it is stored.
 */

export const CONTENT_RATINGS = ['everyone', 'teen', 'mature'] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

export const MAX_STORY_LANGUAGES = 20;
export const MAX_STORY_CREDITS = 200;
export const MAX_STORY_CONTENT_WARNINGS = 40;
export const MAX_STORY_LICENCE_LENGTH = 200;
export const MAX_CREDIT_FIELD_LENGTH = 200;
export const MAX_CONTENT_WARNING_LENGTH = 80;

/** Loose BCP-47: a language subtag with optional region/script subtags. */
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export interface StoryCredit {
  role: string;
  name: string;
  source?: string;
  licence?: string;
}

/** The publication fields a story carries; all optional until it is released. */
export interface StoryPublicationMetadata {
  contentRating?: ContentRating;
  languages?: string[];
  contentWarnings?: string[];
  licence?: string;
  credits?: StoryCredit[];
  aiAssisted?: boolean;
}

function trimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isContentRating(value: unknown): value is ContentRating {
  return typeof value === 'string' && (CONTENT_RATINGS as readonly string[]).includes(value);
}

export function sanitizeContentRating(value: unknown): ContentRating | undefined {
  return isContentRating(value) ? value : undefined;
}

export function isStoryLanguageTag(value: unknown): value is string {
  return typeof value === 'string' && LANGUAGE_PATTERN.test(value);
}

/**
 * Language tags are lower-cased for the primary subtag only, then deduplicated
 * case-insensitively: `en-GB` and `en-gb` are one language, and keeping both
 * would show a reader the same entry twice.
 */
export function sanitizeStoryLanguages(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const languages: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!isStoryLanguageTag(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    languages.push(trimmed);
    if (languages.length >= MAX_STORY_LANGUAGES) break;
  }
  return languages.length > 0 ? languages : undefined;
}

export function sanitizeContentWarnings(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const entry of raw) {
    const trimmed = trimmedString(entry, MAX_CONTENT_WARNING_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push(trimmed);
    if (warnings.length >= MAX_STORY_CONTENT_WARNINGS) break;
  }
  return warnings.length > 0 ? warnings : undefined;
}

export function sanitizeStoryLicence(value: unknown): string | undefined {
  return trimmedString(value, MAX_STORY_LICENCE_LENGTH);
}

/**
 * A credit without both a role and a name credits nobody, so it is dropped
 * rather than stored half-filled and rendered as a blank row on a store page.
 */
export function sanitizeStoryCredits(raw: unknown): StoryCredit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const credits: StoryCredit[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const role = trimmedString(record.role, MAX_CREDIT_FIELD_LENGTH);
    const name = trimmedString(record.name, MAX_CREDIT_FIELD_LENGTH);
    if (!role || !name) continue;

    const credit: StoryCredit = { role, name };
    const source = trimmedString(record.source, MAX_CREDIT_FIELD_LENGTH);
    if (source) credit.source = source;
    const licence = trimmedString(record.licence, MAX_CREDIT_FIELD_LENGTH);
    if (licence) credit.licence = licence;
    credits.push(credit);
    if (credits.length >= MAX_STORY_CREDITS) break;
  }
  return credits.length > 0 ? credits : undefined;
}

/**
 * Normalize every publication field at once, returning only the keys that
 * survived. Callers assign the result over their metadata and delete the keys
 * it omits, exactly as tag and theme normalization already works.
 */
export function sanitizeStoryPublication(source: StoryPublicationMetadata): StoryPublicationMetadata {
  const sanitized: StoryPublicationMetadata = {};

  const contentRating = sanitizeContentRating(source.contentRating);
  if (contentRating) sanitized.contentRating = contentRating;

  const languages = sanitizeStoryLanguages(source.languages);
  if (languages) sanitized.languages = languages;

  const contentWarnings = sanitizeContentWarnings(source.contentWarnings);
  if (contentWarnings) sanitized.contentWarnings = contentWarnings;

  const licence = sanitizeStoryLicence(source.licence);
  if (licence) sanitized.licence = licence;

  const credits = sanitizeStoryCredits(source.credits);
  if (credits) sanitized.credits = credits;

  // Only an explicit `true` is a disclosure. A missing or falsy value means the
  // author has not said, which is not the same as saying "no".
  if (source.aiAssisted === true) sanitized.aiAssisted = true;

  return sanitized;
}

/** The publication keys, so normalizers can delete what a sanitize pass drops. */
export const STORY_PUBLICATION_KEYS = [
  'contentRating',
  'languages',
  'contentWarnings',
  'licence',
  'credits',
  'aiAssisted',
] as const satisfies readonly (keyof StoryPublicationMetadata)[];
