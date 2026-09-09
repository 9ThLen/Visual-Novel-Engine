/**
 * Dates keyed by the app's language, not by the machine's.
 *
 * `toLocaleDateString()` and `new Intl.DateTimeFormat(undefined, …)` both read
 * the OS locale, so a screen written in English or Ukrainian would still print
 * its dates in whatever Windows happens to be set to — «edited 7 июл. 2026 г.»
 * under an English UI. Every screen formats through here instead.
 *
 * Constructing a formatter is the expensive part, so they are cached per
 * language and option set; a screen that re-renders on every keystroke reuses
 * the same one.
 */

import type { Language } from '@/lib/translations';

/** The compact form used by story and scene cards: «Jul 7, 2026». */
export const SHORT_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/** Date and time together, for entries a user picks between by recency. */
export const DATE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

const formatters = new Map<string, Intl.DateTimeFormat>();
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

/** A cached formatter for `language`; omit `options` for the locale's own default date. */
export function dateFormatterFor(
  language: Language | string,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = options ? `${language}|${JSON.stringify(options)}` : language;
  const cached = formatters.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(language, options);
  formatters.set(key, formatter);
  return formatter;
}

/**
 * `value` as a date string in the app's language.
 *
 * Timestamps arrive as epoch milliseconds from the store and as ISO strings
 * from backup manifests, so both are accepted rather than converted at every
 * call site.
 */
export function formatDate(
  value: number | string | Date,
  language: Language | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return dateFormatterFor(language, options).format(value instanceof Date ? value : new Date(value));
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  language: Language | string,
): string {
  let formatter = relativeFormatters.get(language);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(language, { numeric: 'always' });
    relativeFormatters.set(language, formatter);
  }
  return formatter.format(value, unit);
}
