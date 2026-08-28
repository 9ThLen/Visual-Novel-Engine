/**
 * Numbers keyed by the app's language, for the same reason dates are.
 *
 * A bare `toLocaleString()` reads the OS locale, so an English screen on a
 * Ukrainian Windows prints «13 000» where the rest of the sentence says
 * «13,000 words» — the two halves of one line disagreeing about which product
 * this is. See [[lib/format-date.ts]] for the same argument at length.
 *
 * Grouping is all this is for. Sizes and durations have their own spellings in
 * `lib/media-format.ts`, which stay locale-independent on purpose.
 */

import type { Language } from '@/lib/translations';

const formatters = new Map<string, Intl.NumberFormat>();

/** A cached grouping formatter for `language`. */
export function numberFormatterFor(
  language: Language | string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = options ? `${language}|${JSON.stringify(options)}` : language;
  const cached = formatters.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(language, options);
  formatters.set(key, formatter);
  return formatter;
}

/** `value` grouped in the app's language: 13000 → «13,000» in English, «13 000» in Ukrainian. */
export function formatNumber(
  value: number,
  language: Language | string,
  options?: Intl.NumberFormatOptions,
): string {
  return numberFormatterFor(language, options).format(value);
}
